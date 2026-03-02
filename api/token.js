require('dotenv').config();
const {
  IVSRealTimeClient,
  CreateParticipantTokenCommand,
  GetStageCommand
} = require('@aws-sdk/client-ivs-realtime');

// Initialize IVS Realtime client
const client = new IVSRealTimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

module.exports = async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stageArn } = req.body;
    console.log('Received stageArn:', stageArn);

    if (!stageArn) {
      return res.status(400).json({ error: 'stageArn is required' });
    }

    // Get stage details to find the WHEP endpoint
    const stageCommand = new GetStageCommand({ arn: stageArn });
    const stageResponse = await client.send(stageCommand);
    console.log('Stage Response:', JSON.stringify(stageResponse, null, 2));

    // Extract participant configuration for subscribers
    const participantConfigs = stageResponse.stage?.participantConfigs || [];
    const subscriberConfig = participantConfigs.find(c => c.type === 'SUBSCRIBER');
    const publisherConfig = participantConfigs.find(c => c.type === 'PUBLISHER');

    console.log('Subscriber config:', subscriberConfig);
    console.log('Publisher config:', publisherConfig);

    // Get the WHEP/recording URL from participant configuration
    let whepUrl = null;
    if (stageResponse.stage?.recordingConfigurationArn) {
      console.log('Recording enabled');
    }

    // Try to construct WHEP URL from stage ARN
    const stageName = stageArn.split('/').pop();
    const region = stageArn.split(':')[3];
    whepUrl = `https://${region}.ivs.live-video.net/whep/${stageArn}`;

    console.log('Constructed WHEP URL:', whepUrl);

    // Generate a unique user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('Creating token for user:', userId);

    const command = new CreateParticipantTokenCommand({
      stageArn: stageArn,
      userId: userId,
      type: 'SUBSCRIBER',
      duration: 3600
    });

    console.log('Sending command to AWS...');
    const response = await client.send(command);
    console.log('Token Response:', JSON.stringify(response, null, 2));

    const participantToken = response.participantToken;
    const tokenParts = participantToken.token.split('.');
    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

    console.log('Token payload:', JSON.stringify(tokenPayload, null, 2));

    res.json({
      token: participantToken.token,
      userId: participantToken.userId,
      stageArn: stageArn,
      participantId: participantToken.participantId,
      expirationTime: participantToken.expirationTime,
      whepUrl: whepUrl,
      whipUrl: tokenPayload.whip_url,
      eventsUrl: tokenPayload.events_url,
      endpoints: {
        whepUrl: whepUrl,
        eventsUrl: tokenPayload.events_url,
        whipUrl: tokenPayload.whip_url
      }
    });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: error.message });
  }
};
