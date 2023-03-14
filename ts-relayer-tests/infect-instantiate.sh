source ./infect-vars.sh

STARS_CODE_ID=1845
JUNO_CODE_ID=691

# Upload the virus contract to stargaze 
echo "Uploading virus contract to stargaze";

starsd tx wasm instantiate $STARS_CODE_ID '{ "name":"Virus", "symbol":"virus", "minter":"'$STARS_SENDER'" }' --from $KEY --admin $STARS_SENDER --label "mccallofthewild-cw721-virus" --gas-prices 0.025ustars --gas "auto" --gas-adjustment 1.5 --yes > infect-instantiate-stargaze.log

# Upload the virus contract to juno
echo "Uploading virus contract to juno";

junod tx wasm instantiate $JUNO_CODE_ID '{ "name":"Virus", "symbol":"virus", "minter":"'$JUNO_SENDER'" }' --from $KEY --admin $JUNO_SENDER --label "mccallofthewild-cw721-virus" --gas-prices 0.025ujunox --gas "auto" --gas-adjustment 1.5 --yes > infect-instantiate-juno.log