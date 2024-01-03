import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import bodyParser from 'body-parser';
import multer from 'multer';
import fs from "fs";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY

const app = express();
const port = 3000;

// Add middleware to parse JSON data
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up Multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Directory where uploaded files will be stored
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep the original file name
  },
});

const upload = multer({ storage: storage });


const openai = new OpenAI({
    apiKey: apiKey, // Replace with your OpenAI API key
});

// Get the directory name using ES module compatible method
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const absolutePath = path.resolve(__dirname, 'public');

app.use(express.static(absolutePath));

app.get('/', (req, res) => {
    const filePath = path.join(absolutePath, 'chat.html');
    res.sendFile(filePath);
});

app.post('/get', upload.array('files'), async (req, res) => {
    let { msg, threadId, assistantId } = req.body;
  let openaiFilesId = [];

  // Process each file in 'req.files'
  if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
        const openAiFile = await openai.files.create({
          file: fs.createReadStream(file.path),
          purpose: "assistants",
        });
        openaiFilesId.push(openAiFile.id);

        fs.unlink(file.path, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
            }
        });
      }
  }


  if (assistantId == "null") {
      try {
          // Create a new thread if it doesn't exist
        const assistant = await openai.beta.assistants.create({
          name: "File Assistant",
          instructions: "As an AI assistant, your role is to analyze and respond to user inquiries or requests by utilizing the information contained within the provided files.",
          tools: [{"type": "code_interpreter"}, {"type": "retrieval"}],
          model: "gpt-4-1106-preview"
        });
          

          // Store the thread ID in localStorage
            assistantId = assistant.id;
      } catch (error) {
          console.error("Error creating assistant:", error);
          res.status(500).json({ error: "Internal server error" });
          return;
      }
  }
  if (openaiFilesId.length > 0) {
    for (let i = 0; i < openaiFilesId.length; i++) {
      const myAssistantFile = await openai.beta.assistants.files.create(
        assistantId,
        {
          file_id: openaiFilesId[i]
        }
      );
    }
  }
  if (threadId == "null") {
      try {
          // Create a new thread if it doesn't exist
          const myThread = await openai.beta.threads.create();

          // Store the thread ID in localStorage
          threadId = myThread.id;
      } catch (error) {
          console.error("Error creating thread:", error);
          res.status(500).json({ error: "Internal server error" });
          return;
      }
  }
    const message = await openai.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content: msg
        }
      );
    const run = await openai.beta.threads.runs.create(
        threadId,
        { 
          assistant_id: assistantId,
        }
    );
  const checkStatusAndPrintMessages = async (threadId, runId) => {
      let runStatus;
      while (true) {
          runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
          if (runStatus.status === "completed") {
              break; // Exit the loop if the run status is completed
          }
          console.log("Run is not completed yet.");
          await delay(1000); // Wait for 1 second before checking again
      }
      let messages = await openai.beta.threads.messages.list(threadId);
      res.status(200).json({
          response: messages.data[0].content[0].text.value,
          threadId: threadId,
          assistantId: assistantId
      });
  };

  function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
  }

  // Call checkStatusAndPrintMessages function
  checkStatusAndPrintMessages(threadId, run.id);
  

});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
