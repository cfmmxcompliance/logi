async function main() {
    const docId = "sello_4OFdyBTbyQBj8NdOBYvy_1781183279319";
    console.log("Deleting orphaned seal:", docId);
    
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/sellos/${docId}`, {
        method: 'DELETE'
    });
    
    if (response.ok) {
        console.log("Deleted successfully.");
    } else {
        console.error("Error deleting:", response.status, response.statusText);
        const text = await response.text();
        console.error(text);
    }
}

main().catch(console.error);
