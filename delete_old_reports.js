import https from 'https';

const reportsToDelete = [
  '2d594bef-eb74-44a1-8050-6a84fbb63a91',
  '85250ba4-7349-47b0-8cc8-317e7208e010',
  '88ca997b-3a80-4b94-bfe8-44338eb61d8a',
  '8a1979c8-9e6f-4a70-a508-c19c43c9ece3',
  'a52d9698-5556-41d5-ad71-5f84663a6f9f',
  'cec562f5-f5de-496b-b059-d14bc1dbadcd',
  'deb7ebb8-263a-4438-8ccb-42ef25c79bc1',
  'f1345fad-5dfa-45f8-b619-bffc2675177b',
  'fbe0e15b-6a58-46b7-ac6b-94eb930fec50'
];

reportsToDelete.forEach(id => {
    const options = {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/${id}`,
        method: 'DELETE'
    };
    const req = https.request(options, (res) => {
        console.log(`Deleted ${id}: ${res.statusCode}`);
    });
    req.end();
});
