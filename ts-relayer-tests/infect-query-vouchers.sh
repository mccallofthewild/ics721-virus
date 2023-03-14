source ./infect-vars.sh
# after infect-init-update-spike-proteins.sh

STARS_VIRUS_CONTRACT="stars1mdyey88z282kxmg3cdctq6uv4wp4x8qhhq397tfwz29l9zqxj4tsf8zp4m"
JUNO_VIRUS_CONTRACT="juno1vpjp30e4lzgnzr96ss59ryyugy22afnsp3q0n52h9pfr7vq7047sh5ln9s"


STARS_VOUCHER_CLASS_ID="wasm.${STARS_BRIDGE}/${STARS_CHANNEL}/${JUNO_VIRUS_CONTRACT}"
JUNO_VOUCHER_CLASS_ID="wasm.${JUNO_BRIDGE}/${JUNO_CHANNEL}/${STARS_VIRUS_CONTRACT}"

echo "STARS_VOUCHER_CLASS_ID: $STARS_VOUCHER_CLASS_ID"
echo "JUNO_VOUCHER_CLASS_ID: $JUNO_VOUCHER_CLASS_ID"
#  {
#       nft_contract: { class_id: osmoClassId },
#     }
junod q wasm cs smart $JUNO_BRIDGE '{
  "nft_contract" : {
    "class_id": "'$STARS_VIRUS_CONTRACT'"
  }
}'

starsd q wasm cs smart $STARS_BRIDGE '{
  "nft_contract" : {
    "class_id": "'$JUNO_VIRUS_CONTRACT'"
  }
}'