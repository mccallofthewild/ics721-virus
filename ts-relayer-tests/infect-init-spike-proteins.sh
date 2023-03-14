source ./infect-vars.sh

STARS_VIRUS_CONTRACT="stars1mdyey88z282kxmg3cdctq6uv4wp4x8qhhq397tfwz29l9zqxj4tsf8zp4m"
JUNO_VIRUS_CONTRACT="juno1vpjp30e4lzgnzr96ss59ryyugy22afnsp3q0n52h9pfr7vq7047sh5ln9s"

      # extension: {
      #   msg: {
      #     update_spike_proteins: {
      #       accomplice_src: osmoVirus,
      #       // accomplice_dst: we don't know this yet
      #       channel_id: channel.channel.src.channelId,
      #       bridge_contract: wasmBridge,
      #     },
      #   },
      # },
junod tx wasm execute $JUNO_VIRUS_CONTRACT '{
  "extension": {
    "msg": {
      "update_spike_proteins": {
        "accomplice_src": "'$STARS_VIRUS_CONTRACT'",
        "channel_id": "'$JUNO_CHANNEL'",
        "bridge_contract": "'$JUNO_BRIDGE'"
      }
    }
  }
}' --from $KEY --gas-prices 0.025ujunox --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-init-spike-proteins-juno.log

starsd tx wasm execute $STARS_VIRUS_CONTRACT '{
  "extension": {
    "msg": {
      "update_spike_proteins": {
        "accomplice_src": "'$JUNO_VIRUS_CONTRACT'",
        "channel_id": "'$STARS_CHANNEL'",
        "bridge_contract": "'$STARS_BRIDGE'"
      }
    }
  }
}' --from $KEY --gas-prices 0.025ustars --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-init-spike-proteins-stargaze.log

echo "STARS_VIRUS_CONTRACT: $STARS_VIRUS_CONTRACT"