import { ethers } from "ethers";
import * as dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import log from "loglevel";
import ora from "ora";
const fs = require("fs");
const path = require("path");

dotenv.config();
log.setLevel("info");

// Display header with ASCII art
console.log(chalk.green(figlet.textSync("Proof of Credit CLI")));
log.info(chalk.blue("Starting Task Manager initialization..."));

// Set up environment variables and provider
const spinnerProvider = ora(
  chalk.yellow("Connecting to blockchain provider...")
).start();
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
spinnerProvider.succeed(chalk.green("Connected to blockchain provider!"));

// Define chainId and deployment data
let chainId = 17000;
const spinnerData = ora(
  chalk.yellow("Loading contract deployment data...")
).start();
const avsDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      `../contracts/deployments/hello-world/${chainId}.json`
    ),
    "utf8"
  )
);
spinnerData.succeed(chalk.green("Contract deployment data loaded!"));

// Extract contract address and ABI
const proofCreditAddress = avsDeploymentData.addresses.helloWorldServiceManager;
const spinnerABI = ora(chalk.yellow("Loading contract ABI...")).start();
const proofCreditABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/ProofOfCreditScore.json"),
    "utf8"
  )
);
spinnerABI.succeed(chalk.green("Contract ABI loaded successfully!"));

// Initialize the smart contract
log.info(chalk.blue("Initializing Proof of Credit Contract..."));
const proofCreditManager = new ethers.Contract(
  proofCreditAddress,
  proofCreditABI,
  wallet
);
log.info(chalk.green("Contract initialized successfully!"));

// Function to generate random names
function generateRandomName(): string {
  const adjectives = ["Quick", "Lazy", "Sleepy", "Noisy", "Hungry"];
  const nouns = ["Fox", "Dog", "Cat", "Mouse", "Bear"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomName = `${adjective}${noun}${Math.floor(Math.random() * 1000)}`;
  log.info(chalk.cyan(`Generated random task name: ${randomName}`));
  return randomName;
}

// Function to create a new task
async function createNewTask(name: string, user: string, userAddress: string) {
  const spinnerTask = ora(
    chalk.yellow("Creating new task on the blockchain...")
  ).start();

  try {
    // Log task details
    log.info(chalk.cyan(`Task Details:`));
    log.info(chalk.cyan(`- Name: ${name}`));
    log.info(chalk.cyan(`- User: ${user}`));
    log.info(chalk.cyan(`- User Address: ${userAddress}`));

    // Send transaction to createNewTask on smart contract
    const tx = await proofCreditManager.createNewTask(name, user, userAddress);
    spinnerTask.text = chalk.yellow("Waiting for transaction to be mined...");

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    spinnerTask.succeed(chalk.green("Transaction mined successfully!"));
    log.info(chalk.magenta(`Transaction hash: ${receipt.hash}`));
  } catch (error) {
    spinnerTask.fail(chalk.red("Failed to create new task"));
    log.error(chalk.red("Error details:"), error);
  }
}

// Generate a random task name and create a task
const randomName = generateRandomName();
const randomUserName = generateRandomName();
log.info(chalk.blue("Starting task creation..."));
createNewTask(
  randomName,
  randomUserName,
  "0x3F5DDD1ebFF0dc2992Fd95Ff34Ae7E6F097104D5"
);
