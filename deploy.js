// deploy.js - Deployment script for cloud hosting
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Deployment configurations
const DEPLOYMENT_OPTIONS = {
  railway: {
    name: 'Railway',
    command: 'railway up',
    configFile: 'railway.json',
    envFile: '.env'
  },
  render: {
    name: 'Render',
    command: 'render deploy',
    configFile: 'render.yaml',
    envFile: '.env'
  },
  digitalocean: {
    name: 'DigitalOcean App Platform',
    command: 'doctl apps create --spec app.yaml',
    configFile: 'app.yaml',
    envFile: '.env'
  }
};

// Default deployment target
const DEFAULT_TARGET = 'railway';

function printHeader() {
  console.log('\n🚀 SMILE SNIPPER BOT DEPLOYMENT TOOL');
  console.log('=====================================');
}

function checkPrerequisites() {
  console.log('\n🔍 Checking prerequisites...');
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`• Node.js version: ${nodeVersion}`);
  
  // Check if .env exists
  const envExists = fs.existsSync(path.join(__dirname, '.env'));
  console.log(`• .env file: ${envExists ? '✅ Found' : '❌ Not found'}`);
  
  if (!envExists) {
    console.error('\n❌ ERROR: .env file not found. Please create it before deploying.');
    process.exit(1);
  }
  
  // Check if package.json exists
  const packageJsonExists = fs.existsSync(path.join(__dirname, 'package.json'));
  console.log(`• package.json: ${packageJsonExists ? '✅ Found' : '❌ Not found'}`);
  
  if (!packageJsonExists) {
    console.error('\n❌ ERROR: package.json not found. Cannot deploy without it.');
    process.exit(1);
  }
  
  // Check if index.js exists
  const indexJsExists = fs.existsSync(path.join(__dirname, 'index.js'));
  console.log(`• index.js: ${indexJsExists ? '✅ Found' : '❌ Not found'}`);
  
  if (!indexJsExists) {
    console.error('\n❌ ERROR: index.js not found. Cannot deploy without main entry point.');
    process.exit(1);
  }
  
  // Check if critical services exist
  const criticalFiles = [
    'services/realTradingExecutor.js',
    'services/manualTrading.js',
    'services/walletService.js',
    'services/rpcManager.js'
  ];
  
  let allCriticalFilesExist = true;
  for (const file of criticalFiles) {
    const exists = fs.existsSync(path.join(__dirname, file));
    console.log(`• ${file}: ${exists ? '✅ Found' : '❌ Not found'}`);
    if (!exists) allCriticalFilesExist = false;
  }
  
  if (!allCriticalFilesExist) {
    console.error('\n❌ ERROR: Some critical service files are missing. Cannot deploy.');
    process.exit(1);
  }
  
  console.log('\n✅ All critical prerequisites met!');
}

function prepareDeployment(target) {
  console.log(`\n🔧 Preparing deployment to ${DEPLOYMENT_OPTIONS[target].name}...`);
  
  // Check if target config file exists
  const configFile = DEPLOYMENT_OPTIONS[target].configFile;
  const configExists = fs.existsSync(path.join(__dirname, configFile));
  
  console.log(`• Config file (${configFile}): ${configExists ? '✅ Found' : '❌ Not found'}`);
  
  if (!configExists) {
    console.error(`\n❌ ERROR: ${configFile} not found. Cannot deploy to ${DEPLOYMENT_OPTIONS[target].name}.`);
    process.exit(1);
  }
  
  // Check if environment variables are set
  const envVars = [
    'TELEGRAM_BOT_TOKEN',
    'ADMIN_TELEGRAM_ID',
    'WALLET_ENCRYPTION_KEY',
    'DEV_FEE_PERCENT'
  ];
  
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  
  let allEnvVarsSet = true;
  for (const envVar of envVars) {
    const isSet = envContent.includes(`${envVar}=`) && !envContent.includes(`${envVar}=\n`);
    console.log(`• ${envVar}: ${isSet ? '✅ Set' : '❌ Not set'}`);
    if (!isSet) allEnvVarsSet = false;
  }
  
  if (!allEnvVarsSet) {
    console.error('\n❌ ERROR: Some required environment variables are not set. Please update your .env file.');
    process.exit(1);
  }
  
  console.log('\n✅ Deployment preparation complete!');
}

function deploy(target) {
  console.log(`\n🚀 Deploying to ${DEPLOYMENT_OPTIONS[target].name}...`);
  
  try {
    // Execute deployment command
    const command = DEPLOYMENT_OPTIONS[target].command;
    console.log(`• Executing: ${command}`);
    
    const output = execSync(command, { stdio: 'inherit' });
    
    console.log(`\n✅ Deployment to ${DEPLOYMENT_OPTIONS[target].name} successful!`);
    console.log('\n📝 Next steps:');
    console.log('1. Check the deployment logs for any errors');
    console.log('2. Test your bot by sending /start command');
    console.log('3. Verify that trading functionality works correctly');
    
  } catch (error) {
    console.error(`\n❌ ERROR: Deployment to ${DEPLOYMENT_OPTIONS[target].name} failed.`);
    console.error(error.message);
    process.exit(1);
  }
}

function main() {
  printHeader();
  
  // Get deployment target from command line args
  const args = process.argv.slice(2);
  const target = args[0] || DEFAULT_TARGET;
  
  if (!DEPLOYMENT_OPTIONS[target]) {
    console.error(`\n❌ ERROR: Invalid deployment target "${target}". Valid options: ${Object.keys(DEPLOYMENT_OPTIONS).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`\n🎯 Deployment target: ${DEPLOYMENT_OPTIONS[target].name}`);
  
  checkPrerequisites();
  prepareDeployment(target);
  deploy(target);
}

// Run the deployment script
main();