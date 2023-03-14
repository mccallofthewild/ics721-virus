source ./infect-vars.sh
source ./infect-env.sh

STARS_VIRUS_CONTRACT="stars1mdyey88z282kxmg3cdctq6uv4wp4x8qhhq397tfwz29l9zqxj4tsf8zp4m"
JUNO_VIRUS_CONTRACT="juno1vpjp30e4lzgnzr96ss59ryyugy22afnsp3q0n52h9pfr7vq7047sh5ln9s"


# look for a --mnemnonic variable or argument and set the MNEMONIC variable
# if it's not already set
if [ -z "$MNEMONIC" ]; then
  for i in "$@"; do
    if [[ $i == --mnemonic=* ]]; then
      MNEMONIC="${i#*=}"
    fi
  done
fi

# if the MNEMONIC variable is still not set, prompt the user for it
if [ -z "$MNEMONIC" ]; then
  echo "Enter mnemonic:"
  read MNEMONIC
fi

ibc-relayer start \
  --mnemonic $MNEMONIC \
  --src uni-6 \
  --dest elgafar-1 \
  --src-connection connection-96 \
  --dest-connection connection-177 \
  # --src-channel $JUNO_CHANNEL \
  # --dest-channel $STARS_CHANNEL \
  --src-port "wasm.$STARS_BRIDGE" \
  --dest-port "wasm.$JUNO_BRIDGE" \
  --poll 6