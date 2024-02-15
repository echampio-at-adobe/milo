// Listen for messages from the main thread
self.onmessage = async function(event) {
  try {
    const { questionUrl, stringUrl } = event.data;

    // Fetch data from both JSON files
    const questionResponse = await fetch(questionUrl);
    const stringResponse = await fetch(stringUrl);

    // Parse JSON responses
    const questionData = await questionResponse.json();
    const stringData = await stringResponse.json();

    const questionList = {};
    questionData.questions.data.forEach((question) => {
      questionList[question.questions] = question;
    });

    const stringQList = {};
    stringData.questions.data.forEach((question) => {
      stringQList[question.q] = question;
    });

    // Send both JSON objects back to the main thread
    self.postMessage({ questionData, questionList, stringData, stringQList });
  } catch (error) {
    // Send error back to the main thread
    self.postMessage({ error: error.message });
  }
};
