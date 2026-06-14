import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { taskName, taskCat, messages } = req.body;

  if (!taskName || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `あなたは日本の行政手続きや各種名義変更手続きをサポートするアシスタントです。
現在、ユーザーは結婚・入籍に伴う手続き「${taskName}」（カテゴリ: ${taskCat}）について質問しています。
必要書類、窓口情報、注意点、手順などを日本語でわかりやすく答えてください。
回答は簡潔にまとめ、箇条書きを適宜使ってください。`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  res.status(200).json({ content: response.content[0].text });
}
