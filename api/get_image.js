const crypto = require('crypto');
const { Buffer } = require('buffer');

// 🚨 બધી જ ગ્લોબલ કેશ (Cache) કાઢી નાખી છે, જેથી દર વખતે નવો જ ડેટા આવે!

module.exports = async function handler(req, res) {
  // 🛑 Security: CORS સેટીંગ્સ
  const ALLOWED_DOMAIN = "https://neetxcbt.pythonanywhere.com";
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_DOMAIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const paperName = req.body.paper_name;
    const qNum = req.body.q_num;

    if (!paperName || !qNum) throw new Error("Missing params");
    const qInt = parseInt(qNum);
    const chunkName = `${paperName}_P${qInt}`;

    // 🛠️ અતિ મહત્વનો સુધારો: jsDelivr કાઢીને સીધું GitHub Raw વાપર્યું છે!
    // jsDelivr જૂની ફાઈલ પકડી રાખતું હતું, એટલે એરર આવતી હતી.
    const githubUsername = "patelyyy-cyber";
    const repoName = "Elite-CBT-Data";
    // અહી Date.now() લગાવ્યું છે જેથી GitHub ને એમ જ લાગે કે દર વખતે નવી ફાઈલ માંગે છે
    const CDN_URL = `https://raw.githubusercontent.com/${githubUsername}/${repoName}/main/${chunkName}.json?bypass=${Date.now()}`;

    // cache: "no-store" એટલે Vercel ને કહી દીધું કે મગજમાં કશું સેવ રાખતો નહિ
    const response = await fetch(CDN_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub File Not Found: ${chunkName}.json`);

    const paperData = await response.json();
    const encryptedImage = paperData[qNum];
    if (!encryptedImage) throw new Error(`Question ${qNum} image not found in ${chunkName}.`);

    // પાયથોન પાસેથી ચાવી (Key) લેવી (દર વખતે નવી જ લાવશે)
    const pyRes = await fetch(`https://neetxcbt.pythonanywhere.com/api/get_chunk_key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_name: paperName, q_num: qNum }),
      cache: "no-store"
    });
    const pyData = await pyRes.json();

    if (pyData.status !== "success") throw new Error("Key not found on Server");
    const secretKey = pyData.key;

    // AES-256-CBC DECRYPTION (ચાવીથી તાળું ખોલવાની પ્રોસેસ)
    const cipherBytes = Buffer.from(encryptedImage, 'base64');
    const salt = cipherBytes.subarray(8, 16);
    const data = cipherBytes.subarray(16);

    let key_iv = Buffer.alloc(0);
    let prev = Buffer.alloc(0);
    while (key_iv.length < 48) {
        prev = crypto.createHash('md5').update(Buffer.concat([prev, Buffer.from(secretKey, 'utf8'), salt])).digest();
        key_iv = Buffer.concat([key_iv, prev]);
    }
    const key = key_iv.subarray(0, 32);
    const iv = key_iv.subarray(32, 48);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedBase64 = decipher.update(data, undefined, 'utf8');
    decryptedBase64 += decipher.final('utf8');

    // ફાઇનલ ખુલેલો ફોટો મોકલો (કોઈ જ જાતના કેશિંગ વગર)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).json({ status: "success", image_base64: decryptedBase64 });

  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
}