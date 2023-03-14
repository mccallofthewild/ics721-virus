CONTRACTS_CHECKSUM_PATH=/tmp/ics721-contracts-folder-checksum.txt
CONTRACTS_FOLDER_PATH=../contracts

PACKAGES_CHECKSUM_PATH=/tmp/ics721-packages-folder-checksum.txt
PACKAGES_FOLDER_PATH=../packages

TS_RELAYER_TESTS_CHECKSUM_PATH=/tmp/ts-relayer-tests-folder-checksum.txt
TS_RELAYER_TESTS_FOLDER_PATH=./src

# stop wasmd and osmosis early on so compiler has more compute available
sh ./ci-scripts/wasmd/stop.sh
sh ./ci-scripts/osmosis/stop.sh

# lint js and rs before running tests
yarn fix
cargo clippy --fix --allow-dirty

CONTRACTS_PREV_MD5=$(cat $CONTRACTS_CHECKSUM_PATH)
CONTRACTS_MD5=$(find -s $CONTRACTS_FOLDER_PATH -type f -exec md5sum {} \; | md5sum | awk '{print $1}')

PACKAGES_PREV_MD5=$(cat $PACKAGES_CHECKSUM_PATH)
PACKAGES_MD5=$(find -s $PACKAGES_FOLDER_PATH -type f -exec md5sum {} \; | md5sum | awk '{print $1}')

TS_RELAYER_TESTS_PREV_MD5=$(cat $TS_RELAYER_TESTS_CHECKSUM_PATH)
TS_RELAYER_TESTS_MD5=$(find -s $TS_RELAYER_TESTS_FOLDER_PATH -type f -exec md5sum {} \; | md5sum | awk '{print $1}')
# find all files in the TS_RELAYER_TESTS_FOLDER_PATH folder, and all subfolders, and all files in those subfolders, and all subfolders of those subfolders, etc.
# for each file, run md5sum on it, and then run md5sum on the output of that, and then print the first column of the output of that.
# the output of that is a single line, with a single column, which is the md5sum of all the files in the TS_RELAYER_TESTS_FOLDER_PATH folder.

# print to stdout 
echo "CONTRACTS_MD5: $CONTRACTS_MD5"
echo "PATH_MD5: $PATH_MD5"

# if CONTRACTS_MD5 or PACKAGES_MD5 changed, then run ./build.sh
if [ "$CONTRACTS_MD5" != "$CONTRACTS_PREV_MD5" ] || [ "$PACKAGES_MD5" != "$PACKAGES_PREV_MD5" ]; then
    echo "CONTRACTS_MD5 or PACKAGES_MD5 changed, running ./build.sh"
    ./build.sh
else
    echo "CONTRACTS_MD5 and PACKAGES_MD5 unchanged, skipping ./build.sh"
fi

# update the checksum files
echo $CONTRACTS_MD5 > $CONTRACTS_CHECKSUM_PATH
echo $PACKAGES_MD5 > $PACKAGES_CHECKSUM_PATH

nohup sh ./ci-scripts/wasmd/start.sh > /dev/null 2>&1 &
sleep 3
nohup sh ./ci-scripts/osmosis/start.sh > /dev/null 2>&1 &
sleep 3

# if TS_RELAYER_TESTS_MD5 changed, then run yarn test. 
# if TS_RELAYER_TESTS_MD5 didn't change, run yarn test:unit
if [ "$TS_RELAYER_TESTS_MD5" != "$TS_RELAYER_TESTS_PREV_MD5" ]; then
    echo "TS_RELAYER_TESTS_MD5 changed, running yarn test"
    yarn test
else
    echo "TS_RELAYER_TESTS_MD5 unchanged, running yarn test:unit"
    yarn test:unit
fi

# stop wasmd and osmosis early on so compiler has more compute available
sh ./ci-scripts/wasmd/stop.sh
sh ./ci-scripts/osmosis/stop.sh