import { ethers } from "ethers";
import * as dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import log from "loglevel";
import ora from "ora";
import fs from "fs";
import path from "path";
import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import { transformForOnchain, verifyProof } from "@reclaimprotocol/js-sdk";

const client = new ReclaimClient(
  "0x8481DCf244eBB3B776873EFDF1f634eE68062485",
  "0x89106cbba5ed46c99e62803f395db0e75a4ea22e7a38fda45d0d320db8639e1a"
);

dotenv.config();
log.setLevel("info");

// Display header with ASCII art
console.log(chalk.green(figlet.textSync("Operator Proof of Credit")));
log.info(chalk.blue("Starting initialization process..."));

// Check if environment variables are loaded
if (!Object.keys(process.env).length) {
  throw new Error("process.env object is empty");
}

// Set up provider and wallet
const spinnerProvider = ora(
  chalk.yellow("Connecting to blockchain provider...")
).start();
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
spinnerProvider.succeed(chalk.green("Connected to blockchain provider"));

// Define chainId and load deployment data
const chainId = 17000;
const spinnerData = ora(chalk.yellow("Loading deployment data...")).start();
const avsDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      `../contracts/deployments/hello-world/${chainId}.json`
    ),
    "utf8"
  )
);
const coreDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`),
    "utf8"
  )
);
spinnerData.succeed(chalk.green("Deployment data loaded successfully"));

// Define contract addresses and ABIs
const delegationManagerAddress = coreDeploymentData.addresses.delegation;
const avsDirectoryAddress = coreDeploymentData.addresses.avsDirectory;
const proofCreditAddress = avsDeploymentData.addresses.helloWorldServiceManager;
const ecdsaStakeRegistryAddress = avsDeploymentData.addresses.stakeRegistry;

const delegationManagerABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/IDelegationManager.json"),
    "utf8"
  )
);
const ecdsaRegistryABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/ECDSAStakeRegistry.json"),
    "utf8"
  )
);
const proofCreditABI = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../abis/ProofOfCreditScore.json"),
    "utf8"
  )
);
const avsDirectoryABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/IAVSDirectory.json"), "utf8")
);

// Initialize contract objects
log.info(chalk.blue("Initializing contract objects..."));
const delegationManager = new ethers.Contract(
  delegationManagerAddress,
  delegationManagerABI,
  wallet
);
const proofCreditManager = new ethers.Contract(
  proofCreditAddress,
  proofCreditABI,
  wallet
);
const ecdsaRegistryContract = new ethers.Contract(
  ecdsaStakeRegistryAddress,
  ecdsaRegistryABI,
  wallet
);
const avsDirectory = new ethers.Contract(
  avsDirectoryAddress,
  avsDirectoryABI,
  wallet
);
log.info(chalk.green("Contracts initialized"));

// Define task structure
interface Task {
  taskCreatedBlock: number;
  username: string;
  name: string;
  userAddress: string;
}

// Function to sign and respond to a task
const signAndRespondToTask = async (
  taskIndex: number,
  task: Task
): Promise<void> => {
  const message = `Validation: ${task.name}`;
  const messageHash = ethers.solidityPackedKeccak256(["string"], [message]);
  const messageBytes = ethers.getBytes(messageHash);
  const signature = await wallet.signMessage(messageBytes);

  console.log(chalk.cyan(`Signing and responding to task ${taskIndex}...`));

  const operators = [await wallet.getAddress()];
  const signatures = [signature];
  const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]", "uint32"],
    [
      operators,
      signatures,
      ethers.toBigInt((await provider.getBlockNumber()) - 1),
    ]
  );

  const publicOptions = {
    method: "GET", // or POST
    headers: {
      accept: "application/json, text/plain, */*",
    },
  };

  // spinners
  const spinnerProof = ora(
    chalk.yellow("Fetching proof from Reclaim...")
  ).start();

  const proof = await client.zkFetch(
    "https://run.mocky.io/v3/18156caa-f3d8-4382-b3da-d24feffc5990",
    publicOptions,
    { responseMatches: [{ type: "regex", value: "(?<all>.*)" }] }
  );

  spinnerProof.succeed(chalk.green("Proof fetched successfully!"));

  // Verify proof
  const spinnerVerify = ora(chalk.yellow("Verifying proof...")).start();

  if (!proof) {
    spinnerVerify.fail(chalk.red("Proof is null"));
    return;
  }

  const spinnerVerifyProof = ora(
    chalk.yellow("Verifying proof with Reclaim...")
  ).start;
  const verified = await verifyProof(proof);

  if (!verified) {
    spinnerVerify.fail(chalk.red("Proof is invalid"));
    return;
  }

  spinnerVerify.succeed(chalk.green("Proof verified successfully!"));

  // Transform proof for onchain
  const spinnerTransform = ora(
    chalk.yellow("Transforming proof for onchain...")
  ).start();

  const proofData = transformForOnchain(proof);

  spinnerTransform.succeed(
    chalk.green("Proof transformed successfully! Onchain data:")
  );
  log.info(proofData);

  const spinnerCredit = ora(
    chalk.yellow("Calculating credit score...")
  ).start();
  const creditScore = await calculateCreditScore(
    proof?.claimData.context || ""
  );

  spinnerCredit.succeed(chalk.green(`Credit score calculated: ${creditScore}`));

  const tx = await proofCreditManager.respondToTask(
    {
      name: task.name,
      taskCreatedBlock: task.taskCreatedBlock,
      username: task.username,
      userAddress: task.userAddress,
    },
    taskIndex,
    signedTask,
    creditScore
  );

  const receipt = await tx.wait();
  log.info(
    chalk.green(
      `Task ${taskIndex} responded successfully with transaction hash: ${receipt.hash}`
    )
  );
};

// Function to register an operator
const registerOperator = async (): Promise<void> => {
  const spinnerRegister = ora(
    chalk.yellow("Registering as operator...")
  ).start();

  try {
    const tx1 = await delegationManager.registerAsOperator(
      {
        __deprecated_earningsReceiver: wallet.address,
        delegationApprover: "0x0000000000000000000000000000000000000000",
        stakerOptOutWindowBlocks: 0,
      },
      ""
    );
    const receipt = await tx1.wait();
    spinnerRegister.succeed(
      chalk.green(
        `Operator registered with Core EigenLayer, transaction hash: ${receipt.hash}`
      )
    );
  } catch (error) {
    spinnerRegister.fail(chalk.red("Error registering as operator"));
    log.error(chalk.red("Error details:"), error);
  }

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const expiry = Math.floor(Date.now() / 1000) + 36000;

  let operatorSignatureWithSaltAndExpiry = {
    signature: "",
    salt: salt,
    expiry: expiry,
  };

  const operatorDigestHash =
    await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
      wallet.address,
      await proofCreditManager.getAddress(),
      salt,
      expiry
    );

  log.info(chalk.yellow("Signing operator digest hash..."));
  const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
  const operatorSignedDigestHash = operatorSigningKey.sign(operatorDigestHash);
  operatorSignatureWithSaltAndExpiry.signature = ethers.Signature.from(
    operatorSignedDigestHash
  ).serialized;

  const spinnerAVS = ora(
    chalk.yellow("Registering operator with AVS Registry...")
  ).start();

  try {
    const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
      operatorSignatureWithSaltAndExpiry,
      wallet.address
    );
    const receipt = await tx2.wait();
    spinnerAVS.succeed(
      chalk.green(
        `Operator registered with AVS successfully, transaction hash: ${receipt.hash}`
      )
    );
  } catch (error) {
    spinnerAVS.fail(chalk.red("Error registering with AVS"));
    log.error(chalk.red("Error details:"), error);
  }
};

// Function to monitor new tasks
const monitorNewTasks = async (): Promise<void> => {
  proofCreditManager.on(
    "NewTaskCreated",
    async (taskIndex: number, task: Task) => {
      log.info(
        chalk.yellow(`New task detected: ${task.name} (Index: ${taskIndex})`)
      );
      await signAndRespondToTask(taskIndex, task);
    }
  );

  log.info(chalk.blue("Monitoring for new tasks..."));
};

// Main function
const main = async (): Promise<void> => {
  await registerOperator();
  monitorNewTasks().catch((error) => {
    log.error(chalk.red("Error monitoring tasks:"), error);
  });
};

main().catch((error) => {
  log.error(chalk.red("Error in main function:"), error);
});

async function calculateCreditScore(proof: string): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return Math.floor(Math.random() * 100);
}
