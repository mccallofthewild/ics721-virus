source ./infect-vars.sh

VIRUS_PATH="./internal/cw721_virus.wasm";

# Upload the virus contract to stargaze 
echo "Uploading virus contract to stargaze";

starsd tx wasm store ./internal/cw721_virus.wasm --from $KEY --gas-prices 0.025ustars --gas "auto" --gas-adjustment 1.5 --yes > infect-upload-stargaze.log

# Upload the virus contract to juno
echo "Uploading virus contract to juno";

junod tx wasm store $VIRUS_PATH --from $KEY --gas-prices 0.025ujunox --gas "auto" --gas-adjustment 1.5 --yes > infect-upload-juno.log