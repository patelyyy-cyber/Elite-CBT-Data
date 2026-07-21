const crypto = require('crypto');
const { Buffer } = require('buffer');

// 🚨 બધી જ ગ્લોબલ કેશ (Cache) કાઢી નાખી છે, જેથી દર વખતે નવો જ ડેટા આવે!

module.exports = async function handler(req, res) {
  // ૧. 🛑 Security: CORS સેટીંગ્સ (હવે ગમે તે Vercel ડોમેન પરથી ચાલશે)
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    const paperName = req.body.paper_name || req.body.paper_id;
    const qNum = str(req.body.q_num || '');

    if (!paperName || !qNum) throw new Error("Missing params: paper_name or q_num");
    
    const qInt = parseInt(qNum);
    // ૨. 🛠️ અતિ મહત્વનો સુધારો: હવે ૧૦-૧૦ પ્રશ્નોવાળા Part મુજબ સાચું નામ બનશે (દા.ત. _Part1.json)
    const chunkNum = Math.floor((qInt - 1) / 10) + 1;
    const chunkName = `${paperName}_Part${chunkNum}.json`;

    // ૩. 🚀 Cloudflare Worker (Backblaze B2) પરથી ફાઈલ ખેંચો
    const CLOUDFLARE_URL = `https://elite-exam-api.patelyyypaat.workers.dev/${chunkName}`;

    const response = await fetch(CLOUDFLARE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cloudflare CDN File Not Found: ${chunkName} (Status: ${response.status})`);

    const paperData = await response.json();
    // JSON માં પ્રશ્ન નંબર "1" અથવા "P1" અથવા integer 1 ગમે તે રીતે હોય, શોધી લેશે
    const encryptedImage = paperData[qNum] || paperData[`P${qNum}`] || paperData[qInt] || Object.values(paperData)[0];
    if (!encryptedImage) throw new Error(`Question ${qNum} image not found in ${chunkName}.`);

    // ૪. 🔐 Vercel પર ચાલતા પોતાના જ પાયથોન સર્વર પાસેથી ચાવી (Key) લેવી (PythonAnywhere કાઢી નાખ્યું!)
    // req.headers.host આપોઆપ તમારું સાચું Vercel ડોમેન પકડી લેશે
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const pyRes = await fetch(`${protocol}://${host}/api/get_chunk_key`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': req.headers.cookie || '' // સેશન ચાલુ રાખવા માટે કુકીઝ મોકલવી જરૂરી છે
      },
      body: JSON.stringify({ paper_name: paperName, q_num: qNum }),
      cache: "no-store"
    });
    
    const pyData = await pyRes.json();
    if (pyData.status !== "success") throw new Error(`Key not found on Vercel Server: ${pyData.message || ''}`);
    const secretKey = pyData.key;

    // ૫. 🔓 AES-256-CBC DECRYPTION (ચાવીથી તાળું ખોલવાની પ્રોસેસ)
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

    // જો આગળ data:image ના લાગ્યું હોય તો લગાવી દેવું
    if (!decryptedBase64.startsWith("data:image")) {
      decryptedBase64 = `data:image/jpeg;base64,${decryptedBase64}`;
    }

    // ફાઇનલ ખુલેલો ફોટો મોકલો (કોઈ જ જાતના કેશિંગ વગર)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).json({ status: "success", image_base64: decryptedBase64 });

  } catch (error) {
    console.error("Decryption Handler Error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
}