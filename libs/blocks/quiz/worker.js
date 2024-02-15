// Listen for messages from the main thread
self.onmessage = async function(event) {
  try {
    const { questionsUrl, dataStringsUrl } = event.data;

    // Fetch data from both JSON files
    const questionsResponse = await fetch(questionsUrl);
    const dataStringsResponse = await fetch(dataStringsUrl);
    console.log(questionsResponse, dataStringsResponse);

    // Parse JSON responses
    const questions = await questionsResponse.json();
    const dataStrings = await dataStringsResponse.json();
    console.log(questions, dataStrings); 

    // Send both JSON objects back to the main thread
    self.postMessage({ questions, dataStrings });
  } catch (error) {
    // Send error back to the main thread
    self.postMessage({ error: error.message });
  }
};
