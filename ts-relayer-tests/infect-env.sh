# try to use .env file if it exists
if [ -f .env ]; then
  export $(cat .env | sed 's/#.*//g' | xargs)
fi