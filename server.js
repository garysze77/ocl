require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  IVSRealTimeClient,
  CreateParticipantTokenCommand,
  GetStageCommand
} = require('@aws-sdk/client-ivs-realtime');

const app = express();
const port = process.env.PORT || 3000;

// Initialize IVS Realtime client
const client = new IVSRealTimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Generate token endpoint
app.post('/api/token', async (req, res) => {
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
    // The WHEP URL format is typically: https://{region}.ivs.{domain}/whep/arn:aws:ivs:{region}:{account}:stage/{stageName}
    let whepUrl = null;
    if (stageResponse.stage?.recordingConfigurationArn) {
      // If recording is enabled, there might be an HLS URL instead
      console.log('Recording enabled');
    }

    // Try to construct WHEP URL from stage ARN
    // Format: arn:aws:ivs:region:account:stage/stageName
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
      // WHEP URL - either from our constructed URL or from token
      whepUrl: whepUrl,
      // Other endpoints from token
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
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
