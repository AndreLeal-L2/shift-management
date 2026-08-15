const { supabase } = require('./config');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('sales_history')
        .select('*')
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { sales } = req.body;
      const { data, error } = await supabase
        .from('sales_history')
        .insert([{ recorded_at: new Date().toISOString(), sales }])
        .select();

      if (error) throw error;
      return res.status(201).json(data[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
