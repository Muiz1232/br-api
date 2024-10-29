import express from'express';
import fs from'fs-extra';
import fetch from 'node-fetch';


const app = express();
app.use(express.json());

const sendMessage = async (chatId, text, token) => {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
        });

        if (!response.ok) throw new Error(`Telegram API error: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
};

// Helper function to edit a message via Telegram
const editMessage = async (chatId, messageId, text, token) => {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: "Markdown" })
        });

        if (!response.ok) throw new Error(`Telegram API error: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Error editing message:', error);
        throw error;
    }
};


// User Add Endpoint
app.post('/useradd', async (req, res) => {
    const { bot_id, user_id } = req.body;
    if (!bot_id || !user_id) return res.status(400).send("bot_id and user_id are required");

    const botFolder = `./bots/${bot_id}`;
    const userFile = `${botFolder}/user.json`;

    try {
        await fs.ensureDir(botFolder); // Ensure bot folder exists
        const usersData = await fs.readJson(userFile).catch(() => ({ users: [] }));
        
        if (!usersData.users.includes(user_id)) {
            usersData.users.push(user_id);
            await fs.writeJson(userFile, usersData);
        }
        
        res.send({ success: true, message: `User ${user_id} added to bot ${bot_id}` });
    } catch (error) {
        res.status(500).send({ success: false, message: 'Error adding user', error });
    }
});

// Broadcast Endpoint
app.post('/broadcast', async (req, res) => {
    const { bot_id, text, admin_id, token } = req.body;
    if (!bot_id || !text || !admin_id || !token) return res.status(400).send("bot_id, text, bot token, and admin_id are required");

    const userFile = `./bots/${bot_id}/user.json`;

    try {
        const usersData = await fs.readJson(userFile);
        const users = usersData.users;
        const totalUsers = users.length;
        
        // Initialize messageId to null
        let messageId = null;

        try {
            // Notify admin about the start of the broadcast
            const adminMessage = await sendMessage(admin_id, `**🔎**`, token);
            messageId = adminMessage.result.message_id;
        } catch (error) {
            console.error("Error sending initial message to admin:", error);
            res.status(500).send({ success: false, message: "Failed to notify admin about broadcast start" });
            return;
        }

        // Initialize counters
        let stats = { success: 0, failed: 0, blocked: 0, deleted: 0 };

        // Loop through each user and send the message
        for (const user of users) {
            try {
                await sendMessage(user, text, token);
                stats.success++;

                // Update admin with the current stats
                const statusText = `
📊 **User Stats Summary**

👥 **Total Users:** ${totalUsers}

🟢 **Success:** ${stats.success}
🚫 **Blocked:** ${stats.blocked}
❌ **Deleted:** ${stats.deleted}
⚠️ **Failed:** ${stats.failed}

Keep up the great work! 💪
                `;
                if (messageId) await editMessage(admin_id, messageId, statusText, token);

            } catch (error) {
                if (error.response && error.response.status === 403) {
                    stats.blocked++;
                } else if (error.response && error.response.status === 400) {
                    stats.deleted++;
                } else {
                    stats.failed++;
                }
                const statusText = `
📊 **User Stats Summary**

👥 **Total Users:** ${totalUsers}

🟢 **Success:** ${stats.success}
🚫 **Blocked:** ${stats.blocked}
❌ **Deleted:** ${stats.deleted}
⚠️ **Failed:** ${stats.failed}

Keep up the great work! 💪
                `;
                if (messageId) await editMessage(admin_id, messageId, statusText, token);
            }
        }

        res.send({ success: true, message: "Broadcast completed with live updates" });
    } catch (error) {
        // Only try to edit the message if messageId is defined
        if (messageId) await editMessage(admin_id, messageId, 'FAILED TO BROADCAST', token);
        res.status(500).send({ success: false, message: 'Error during broadcast', error });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
