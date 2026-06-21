const BASE_URL = "http://localhost:3000";

async function runTrafficTest() {
    console.log("Starting live traffic test. Flooding /api/service with 35 concurrent queries...");
    
    const requests = Array.from({ length: 35 }, (_, idx) => {
        return fetch(`${BASE_URL}/api/service`)
            .then(async res => {
                const data = await res.json();
                console.log(`[Request #${idx+1}] Status: ${res.status} | active: ${data.activeConnections ?? 'N/A'}`);
                return { status: res.status, data };
            })
            .catch(err => {
                console.error(`[Request #${idx+1}] Error: ${err.message}`);
                return { status: 500, error: err };
            });
    });

    const results = await Promise.all(requests);
    const successCount = results.filter(r => r.status === 200).length;
    const failCount = results.filter(r => r.status !== 200).length;
    
    console.log(`\nTraffic test complete.`);
    console.log(`Successful queries: ${successCount}`);
    console.log(`Failed queries: ${failCount}`);
    console.log(`Error rate under load: ${Math.round((failCount / 35) * 100)}%`);
    console.log(`\nThe server background monitor should detect this error spike and automatically trigger the incident resolution loop within a few seconds!`);
}

runTrafficTest().catch(console.error);
