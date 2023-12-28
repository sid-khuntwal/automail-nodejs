const { authenticate } = require("@google-cloud/local-auth");
const express = require("express");
const app = express();
const port = 8000;
const path = require("path");
const fs = require("fs").promises;
const { google } = require("googleapis");

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://mail.google.com/",
];

app.get("/", async (reg, res) => {
    // Load client secrets from a local file.
    const credentials = await fs.readFile("credentials.json");

    // Authorize a client with credentials, then call the Gmail API.
    const auth = await authenticate({
        keyfilePath: path.join(__dirname, "credentials.json"),
        scopes: SCOPES,
    });

    console.log("Authentication = ", auth);

    const gmail = google.gmail({ version: "v1", auth });

    const response = await gmail.users.labels.list({
        userId: "me",
    });

    const LABEL_NAME = "Vacation";

    // Load credentials from file
    async function loadCredentials() {
        const filepath = path.join(process.cwd(), "credentials.json");
        const content = await fs.readFile(filePath, { encoding: "utf8" });
        return JSON.parse(content);
    }

    // GET message that you have no replies

    async function getUnrepliedMessage(auth) {
        const gmail = google.gmail({ version: "v1", auth });
        const res = await gmail.users.messages.list({
            userId: "me",
            q: "-in:chats -from:me -has:userlabels",
        });
        return res.data.messages || [];
    }

    // Send reply to a msg

    async function sendReply(auth, message) {
        const gmail = google.gmail({ version: "v1", auth });
        const res = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
        });
        const subject = res.data.payload.headers.find(
            (header) => header.name === "Subject"
        ).value;
        const from = res.data.payload.headers.find(
            (header) => header.name === "From"
        ).value;
        const replyTo = from.match(/<(.*)>/)[1];
        const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
        const replyBody = `Hi, \n\nThis is an automated mail, I'm currently on vacation. I will get back to you soon. \n\nRegards, \nThanks`;

        const rawMessage = [
            `From: me`,
            `To: ${replyTo}`,
            `Subject: ${replySubject}`,
            `In-Reply-To: ${message.id}`,
            `References: ${message.id}`,
            "",
            replyBody,
        ].join("\n");

        const encodedMessage = Buffer.from(rawMessage)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        });
    }

    async function createLabel(auth) {
        const gmail = google.gmail({ version: "v1", auth });

        try {
            const res = await gmail.users.labels.create({
                userId: "me",
                requestBody: {
                    name: LABEL_NAME,
                    labelListVisibility: "labelShow",
                    messageListVisibility: "show",
                },
            });
            return res.data.id;
        } catch (err) {
            if (err.code === 409) {
                // Label already exists
                const res = await gmail.users.labels.list({
                    userId: "me",
                });
                const label = res.data.labels.find(
                    (label) => label.name === LABEL_NAME
                );
                return label.id;
            } else {
                throw err;
            }
        }
    }

    // Add label to a message move it to the label folder
    async function addLabel(auth, message, labelId) {
        const gmail = google.gmail({ version: "v1", auth });
        await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
            },
        });
    }

    // Main Function
    async function main() {
        // Create a label for the app
        const labelId = await createLabel(auth);
        console.log(`Wohoo! Got the label with id --> ${labelId}`);

        setInterval(async () => {
            const messages = await getUnrepliedMessage(auth);
            console.log(`Hey there! You got ${messages.length} unreplied messages`);

            for (const message of messages) {
                await sendReply(auth, message);
                console.log(`I sent the reply to message with id -->  ${message.id}`);

                await addLabel(auth, message, labelId);
                console.log(
                    `I have added label to message with id --> ${message.id}. Please check later after your vacation is over!`
                );
            }
        }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
    }

    main().catch(console.error);

    const labels = response.data.labels;
    res.send("You have successfully subscribed to our services.");
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});