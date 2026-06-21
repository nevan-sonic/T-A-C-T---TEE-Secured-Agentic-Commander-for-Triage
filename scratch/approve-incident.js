const ethers = require("ethers");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const BASE_URL = "http://localhost:3000";
const PRIVATE_KEY = process.env.T3_PRIVATE_KEY || process.env.T3N_API_KEY || ethers.Wallet.createRandom().privateKey;
const wallet = new ethers.Wallet(PRIVATE_KEY);

async function autoApprove() {
    console.log(`Checking for pending delegation approvals at ${BASE_URL}/api/approvals...`);
    
    const res = await fetch(`${BASE_URL}/api/approvals`);
    const approvals = await res.json();
    
    if (approvals.length === 0) {
        console.log("No pending approvals found.");
        return;
    }
    
    console.log(`Found ${approvals.length} pending approval(s).`);
    
    for (const app of approvals) {
        const id = app.id;
        const approverDID = app.approverDID;
        const scope = app.scope;
        
        console.log(`\nProcessing Approval ID: ${id}`);
        console.log(`Approver DID: ${approverDID}`);
        console.log(`Scope: ${scope}`);
        
        const matches = approverDID.match(/did:t3n:([0-9a-fA-F]+)/) || approverDID.match(/did:t3:user:([0-9a-fA-F]+)/) || approverDID.match(/did:t3:user:(\w+)/);
        const expectedAddressHex = matches ? matches[1] : 'c8eb415587d29e3155bb615149156b0ce5f2ecc5';
        const tid = expectedAddressHex.toLowerCase();
        
        const message = `T3 Agent Authorization Grant\nAgent DID: did:t3:agent:department-of-incidents\nContract: z:${tid}:incident-contracts\nFunction: ${scope}\nOutbound Hosts: api.github.com\nApproval ID: ${id}`;
        
        console.log(`Constructed Message to Sign:\n--------------------\n${message}\n--------------------`);
        
        console.log(`Signing message with address: ${wallet.address}`);
        const signature = await wallet.signMessage(message);
        console.log(`Signature generated: ${signature}`);
        
        console.log(`Submitting signature to /api/approve...`);
        const approveRes = await fetch(`${BASE_URL}/api/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, signature })
        });
        
        const approveResult = await approveRes.json();
        console.log(`Server Response Status: ${approveRes.status}`);
        console.log(`Server Response Body:`, approveResult);
    }
}

autoApprove().catch(console.error);
