export STARS_BRIDGE=stars1ve46fjrhcrum94c7d8yc2wsdz8cpuw73503e8qn9r44spr6dw0lsvmvtqh
export JUNO_BRIDGE=juno1stv6sk0mvku34fj2mqrlyru6683866n306mfv52tlugtl322zmks26kg7a
export STARS_CHANNEL=channel-211
export JUNO_CHANNEL=channel-93

export KEY="game-of-nfts-sh"

export JUNO_SENDER=$(junod keys show $KEY --output json | jq -r ".address")
export STARS_SENDER=$(starsd keys show $KEY --output json | jq -r ".address")

echo "JUNO_SENDER: $JUNO_SENDER"
echo "STARS_SENDER: $STARS_SENDER"

starsd config node "https://rpc.elgafar-1.stargaze-apis.com:443"
starsd config chain-id "elgafar-1"
starsd config broadcast-mode "block"

junod config node "https://juno-testnet-rpc.polkachu.com:443"
junod config chain-id "uni-6"
junod config broadcast-mode "block"

# hex encoded "hello" = 68656c6c6f
# bash command to hex decode an output, including newlines
# > echo "68656c6c6f" | xxd -r -p -c 1000000
# bash command to base64 decode an output (including newlines)
# > echo "aGVsbG8=" | base64 -d
# bash command to hex encode an input
# > echo "hello" | xxd -p -c 1000000

# {
#   "contracts": [
#     "juno130457qw40vpgq5s9tjwzp2l7tf4w8ejj9nkdhu6nm6kes20kxkpqwah4p4",
#     "juno14e6rdkgr4x5w2f5xj9z9mslrl4lezyt056zgua3kq5kg0phzcfwsvzszfw",
#     "juno1h3x3hlfn

# using jq, run `junod q wasm contract <ADDRESS>` on each of the addresses output from 
# `junod q wasm list-contract-by-code 386`, waiting 1 second between each query 
# (to avoid rate limiting), and then output the results to a file
#

# OUTPUT_FILE="juno-contracts.txt"
# echo "" > $OUTPUT_FILE
# for i in $(junod q wasm list-contract-by-code 386 --output json | jq -r ".contracts[]"); do
#   echo "querying $i"
#   junod q wasm contract $i >> $OUTPUT_FILE
#   sleep 1
# done