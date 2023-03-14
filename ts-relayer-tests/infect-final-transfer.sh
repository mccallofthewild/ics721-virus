source ./infect-vars.sh
# after infect-init-update-spike-proteins.sh

STARS_VIRUS_CONTRACT="stars1mdyey88z282kxmg3cdctq6uv4wp4x8qhhq397tfwz29l9zqxj4tsf8zp4m"
JUNO_VIRUS_CONTRACT="juno1vpjp30e4lzgnzr96ss59ryyugy22afnsp3q0n52h9pfr7vq7047sh5ln9s"

# junod tx wasm execute $JUNO_VIRUS_CONTRACT '{
#   "transfer_nft": {
#     "recipient": "doesntmatterwontbevalidated",
#     "token_id": "doesntmatterwontbevalidated"
#   }
# }' --from $KEY --gas-prices 0.025ujunox --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-final-transfer-juno.log

starsd tx wasm execute $STARS_VIRUS_CONTRACT '{
  "transfer_nft": {
    "recipient": "doesntmatterwontbevalidated",
    "token_id": "doesntmatterwontbevalidated"
  }
}' --from $KEY --gas-prices 0.025ustars --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-final-transfer-stargaze.log