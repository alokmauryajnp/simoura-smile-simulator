require("dotenv").config();
const axios = require("axios");
const fs = require("fs");

const API_KEY = process.env.POLLINATIONS_API_KEY;

async function testKimiK3() {
    const imagePath = "./smile.jpg";

    const imageBase64 = fs.readFileSync(imagePath).toString("base64");

    const response = await axios.post(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
            model: "moonshotai/kimi-k3",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `
Analyze this dental smile photograph.

Tell me:
1. Whether the teeth are clearly visible
2. Which teeth can be individually identified
3. Any visible aesthetic characteristics
4. Whether the image is suitable for smile visualization

Keep the answer concise.
`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 2500,
            temperature: 1,
            reasoning_effort: "low",
            stream: false
        },
        {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 180000
        }
    );

    console.log("\n========== KIMI K3 / POLLINATIONS ==========\n");

    console.log(
        response.data.choices?.[0]?.message?.content ||
        response.data.choices?.[0]?.message
    );

    console.log("\n============================================\n");
}

testKimiK3().catch(error => {
    console.error("ERROR:");

    if (error.response) {
        console.error(error.response.status);
        console.error(error.response.data);
    } else {
        console.error(error.message);
    }
});