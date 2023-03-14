source ./infect-vars.sh
# after infect-init-update-spike-proteins.sh

STARS_VIRUS_CONTRACT="stars1mdyey88z282kxmg3cdctq6uv4wp4x8qhhq397tfwz29l9zqxj4tsf8zp4m"
JUNO_VIRUS_CONTRACT="juno1vpjp30e4lzgnzr96ss59ryyugy22afnsp3q0n52h9pfr7vq7047sh5ln9s"

#  {
#           transfer_nft: {
#             recipient: "doesntmatterwontbevalidated",
#             token_id: "doesntmatterwontbevalidated",
#           },
#         },

STARGAZE_VOUCHER=stars1d3qm89lafya0w77nqc7qp2r3u5agshjx64mzv9cckjzz2wp52p6qtyw0zk
JUNO_VOUCHER=juno162vh76u6hr6ks78676d8hwu200v4usw9rq46qsxwq4ka86f2h3essw34h9


junod tx wasm execute $JUNO_VIRUS_CONTRACT '{
  "extension": {
    "msg": {
      "update_spike_proteins": {
        "accomplice_dst": "'$JUNO_VOUCHER'"
      }
    }
  }
}' --from $KEY --gas-prices 0.025ujunox --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-update-spike-proteins-juno.log

starsd tx wasm execute $STARS_VIRUS_CONTRACT '{
  "extension": {
    "msg": {
      "update_spike_proteins": {
        "accomplice_dst": "'$STARGAZE_VOUCHER'"
      }
    }
  }
}' --from $KEY --gas-prices 0.025ustars --gas "auto" --gas-adjustment 1.5 --yes --output json | jq > infect-update-spike-proteins-stargaze.log
