import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // アドバイザーモード
  if (req.body.mode === 'advisor') {
    const { tasks, doneIds, today } = req.body;
    if (!tasks) return res.status(400).json({ error: 'Invalid request body' });

    const taskLines = tasks.map(t => {
      const status = doneIds.includes(t.id) ? '✅完了' : '⬜未完了';
      const deadline = t.deadline ? `（期限: ${t.deadline}）` : '';
      const blocked = t.deps?.length > 0 && t.deps.some(d => !doneIds.includes(d)) ? ' ⚠️ブロック中' : '';
      return `- ${status} [${t.cat}] ${t.name}${deadline}${blocked}`;
    }).join('\n');

    const systemPrompt = `あなたは結婚・入籍の手続きをサポートするアシスタントです。
以下のタスク一覧と進捗状況を見て、具体的なアドバイスを日本語で返してください。

## 回答形式
1. **今すぐ着手すべき優先タスク**（3件以内）
2. **今週中に済ませたいこと**
3. **注意点・アドバイス**

箇条書きで簡潔にまとめてください。`;

    const userMessage = `今日は${today}です。以下が現在のタスク一覧です：\n\n${taskLines}\n\n優先してやるべきことを教えてください。`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    return res.status(200).json({ content: response.content[0].text });
  }

  // 要約モード
  if (req.body.mode === 'summarize') {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Invalid request body' });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: '与えられたテキストを、窓口メモとして保存するために3行以内で箇条書きに要約してください。日本語で。',
      messages: [{ role: 'user', content: text }],
    });

    return res.status(200).json({ content: response.content[0].text });
  }

  // タスク個別チャットモード
  const { taskName, taskCat, messages } = req.body;
  if (!taskName || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const systemPrompt = `あなたは日本の行政手続きや各種名義変更手続きをサポートするアシスタントです。
現在、ユーザーは結婚・入籍に伴う手続き「${taskName}」（カテゴリ: ${taskCat}）について質問しています。
必要書類、窓口情報、注意点、手順などを日本語でわかりやすく答えてください。
回答は簡潔にまとめ、箇条書きを適宜使ってください。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  res.status(200).json({ content: response.content[0].text });
}
