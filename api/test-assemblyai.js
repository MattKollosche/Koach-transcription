module.exports = async (req, res) => {
  try {
    console.log('Testing AssemblyAI import...');
    
    // Test if we can import AssemblyAI
    const { AssemblyAI } = require('assemblyai');
    console.log('AssemblyAI imported successfully');
    
    // Test if we can create an instance
    const aai = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY || 'test-key'
    });
    console.log('AssemblyAI instance created successfully');
    
    res.json({
      status: 'success',
      message: 'AssemblyAI SDK is working',
      hasApiKey: !!process.env.ASSEMBLYAI_API_KEY
    });
    
  } catch (error) {
    console.error('AssemblyAI test error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
};
