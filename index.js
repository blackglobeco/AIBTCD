const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const readline = require('readline');

const network = bitcoin.networks.bitcoin; // Change to bitcoin.networks.testnet for Testnet

// ASCII Banner
var figlet = require('figlet');
figlet.text('BTC - TX Bot', {
  font: 'Standard',
  horizontalLayout: 'default',
  width: 40,
  whitespaceBreak: false
}, function(err, data) {
  if (err) {
    console.log('Something went wrong...');
    console.dir(err);
    return;
  }
  console.log(data);
});

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

// Function to fetch UTXOs using Blockstream API
const getUTXOs = async (address) => {
  try {
    const response = await axios.get(`https://blockstream.info/api/address/${address}/utxo`);
    return response.data;
  } catch (error) {
    console.error("Error fetching UTXOs:", error.response?.data || error.message);
    return [];
  }
};

// Function to broadcast transaction via Blockstream API
const broadcastTransaction = async (rawTxHex) => {
  try {
    const response = await axios.post(`https://blockstream.info/api/tx`, rawTxHex, {
      headers: { 'Content-Type': 'text/plain' }
    });
    return response.data;
  } catch (error) {
    console.error("Error broadcasting transaction:", error.response?.data || error.message);
    return null;
  }
};

// Function to process transactions
const txBot = async () => {
  console.log("🚀 AI BTC Wallet Drainer\n");

  try {
    // Get user inputs
    const wif = await getUserInput("🔑 Enter the target wallet's Private Key (WIF format): ");
    const receiverWallet = await getUserInput("🏦 Enter Receiver BTC Address: ");
    
    rl.close(); // Close input prompt

    // Generate key pair and BTC address from private key
    const keyPair = bitcoin.ECPair.fromWIF(wif, network);
    const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });

    console.log(`🔍 Checking balance for: ${address}`);

    // Fetch UTXOs from Blockstream API
    const utxos = await getUTXOs(address);

    if (utxos.length === 0) {
      console.log("❌ No UTXOs found. Exiting...");
      return;
    }

    // Prepare a new transaction
    const psbt = new bitcoin.Psbt({ network });
    let totalInput = 0;
    const fee = 1000; // Set fee in satoshis (adjustable)

    // Add UTXOs as inputs
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
      });
      totalInput += utxo.value; // Sum input amount
    }

    // Calculate amount to send
    const sendAmount = totalInput - fee;
    if (sendAmount <= 0) {
      console.log("❌ Insufficient balance after fee.");
      return;
    }

    // Add output (receiver address)
    psbt.addOutput({
      address: receiverWallet,
      value: sendAmount,
    });

    // Sign transaction
    for (let j = 0; j < utxos.length; j++) {
      psbt.signInput(j, keyPair);
    }
    psbt.finalizeAllInputs();

    // Extract and broadcast transaction
    const rawTxHex = psbt.extractTransaction().toHex();
    const txid = await broadcastTransaction(rawTxHex);

    if (txid) {
      console.log(`✅ BTC Drained! TX ID: ${txid}`);
      console.log(`🔗 View TX: https://blockstream.info/tx/${txid}`);
    } else {
      console.log("❌ Failed to drain BTC.");
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
  }
};

// Run the bot
txBot();
