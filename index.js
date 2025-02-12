const bitcoin = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const ecc = require('tiny-secp256k1'); // Needed for ecpair
const axios = require('axios');
const readline = require('readline');
const figlet = require('figlet');

const ECPair = ECPairFactory(ecc); // Create ECPair instance
const network = bitcoin.networks.bitcoin; // Bitcoin mainnet

// Function to prompt user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const getUserInput = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

// Display ASCII Banner First
figlet.text('BTC - TX Bot', {
  font: 'Standard',
  horizontalLayout: 'default',
  width: 40,
  whitespaceBreak: false
}, async function (err, data) {
  if (err) {
    console.log('Something went wrong...');
    console.dir(err);
    return;
  }

  console.clear();
  console.log(data);
  console.log("\n🚀 BTC Wallet Auto Sender / Address Cleaner\n");

  // Ask for user input
  const wif = await getUserInput("🔑 Enter the target wallet's Private Key (WIF format): ");
  const receiverWallet = await getUserInput("🏦 Enter your Receiver BTC Address: ");

  rl.close(); // Close input prompt

  console.log("\n✅ Inputs received!");
  console.log(`🔑 Private Key (WIF): ${wif}`);
  console.log(`🏦 Receiver BTC Address: ${receiverWallet}\n`);

  // Call transaction function
  sendBitcoinTransaction(wif, receiverWallet);
});

async function sendBitcoinTransaction(wif, receiverAddress) {
  try {
    console.log("🔄 Fetching UTXOs (Unspent Transactions)...");

    // Fix: Explicitly create the keyPair and ensure publicKey is a Buffer
    const keyPair = ECPair.fromWIF(wif, network);
    const publicKey = Buffer.from(keyPair.publicKey); // Fix: Ensure it's a Buffer

    // Fix: Use correct format for P2PKH address
    const { address } = bitcoin.payments.p2pkh({ pubkey: publicKey, network });

    console.log(`📬 Wallet Address: ${address}`);

    // Fetch UTXOs from Blockstream API
    const utxoRes = await axios.get(`https://blockstream.info/api/address/${address}/utxo`);
    const utxos = utxoRes.data;

    if (utxos.length === 0) {
      console.log("❌ No UTXOs found. The wallet has no balance.");
      return;
    }

    console.log(`✅ Found ${utxos.length} UTXOs. Fetching raw transactions...`);

    // Fetch full raw transactions for each UTXO
    for (const utxo of utxos) {
      const rawTxRes = await axios.get(`https://blockstream.info/api/tx/${utxo.txid}/hex`);
      utxo.rawTx = rawTxRes.data;
    }

    console.log("✅ All UTXO data retrieved. Preparing transaction...");

    // Create a Bitcoin transaction
    const psbt = new bitcoin.Psbt({ network });
    let inputSum = 0;

    utxos.forEach(utxo => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.rawTx, 'hex'), // Include raw transaction
      });
      inputSum += utxo.value;
    });

    const fee = 10000; // Approximate fee (satoshis)
    const sendAmount = inputSum - fee;

    if (sendAmount <= 0) {
      console.log("❌ Insufficient funds after fees.");
      return;
    }

    psbt.addOutput({
      address: receiverAddress,
      value: sendAmount,
    });

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();
    const rawTx = psbt.extractTransaction().toHex();

    console.log("🚀 Broadcasting transaction...");
    const broadcastRes = await axios.post('https://blockstream.info/api/tx', rawTx);

    console.log(`✅ Transaction broadcasted successfully!`);
    console.log(`🔗 TX ID: ${broadcastRes.data}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}
