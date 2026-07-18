const crypto = require('crypto');
const { Buffer } = require('buffer');

module.exports = async function handler(req, res) {
  // 🛑 Security: CORS સેટીંગ્સ
  const ALLOWED_DOMAIN = "https://neetxcbt.pythonanywhere.com";
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_DOMAIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRFToken');

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

    // STEP 1: DIRECT FILE SELECTOR
    const chunkName = `${paperName}_P${qInt}`;

    // STEP 2: LOAD 10MB CHUNK JSON (Cache સિસ્ટમ કાઢી નાખી છે - હવે દર વખતે ફ્રેશ ડેટા આવશે)
    const githubUsername = "patelyyy-cyber";
    const repoName = "Elite-CBT-Data";
    const CDN_URL = `https://cdn.jsdelivr.net/gh/${githubUsername}/${repoName}@main/${chunkName}.json?v=${Date.now()}`;
      
    const response = await fetch(CDN_URL);
    if (!response.ok) throw new Error(`GitHub File Not Found: ${chunkName}.json`);
      
    const paperData = await response.json();
    const encryptedImage = paperData[qNum];
    if (!encryptedImage) throw new Error(`Question ${qNum} image not found in ${chunkName}.`);

    // STEP 3: GET DECRYPTION KEY FROM PYTHON (હવે આ સીધું Python પાસેથી નવી જ ચાવી લેશે)
    const pyRes = await fetch(`https://neetxcbt.pythonanywhere.com/api/get_chunk_key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_name: paperName, q_num: qNum })
    });
    
    const pyData = await pyRes.json();
    if (pyData.status !== "success") throw new Error("Key not found on Server");
    const secretKey = pyData.key;

    // STEP 4: AES-256-CBC DECRYPTION
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

    // STEP 5: FINAL RESPONSE (image_base64 ની જગ્યાએ ફક્ત image મોકલશે)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); 
    return res.status(200).json({ status: "success", image: decryptedBase64 });

  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
}