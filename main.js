import { Client, Databases } from 'node-appwrite';
import { GoogleGenerativeAI } from '@google/generative-ai';

const client = new Client();

const endpoint = process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1';
console.log('Using endpoint:', endpoint);

client
  .setEndpoint(endpoint)
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || '67d074d0001dadc04f94')
  .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

const databases = new Databases(client);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const config = {
  databaseId: 'career4me',
  careerPathsCollectionId: 'careerPaths',
};

export default async ({ req, res, log, error }) => {
  try {
    log('=== Function Started ===');
    
    // Parse input with better error handling
    let requestData;
    try {
      requestData = JSON.parse(req.body);
    } catch (e) {
      error('Invalid JSON input');
      return res.json({
        success: false,
        error: 'Invalid JSON input',
        statusCode: 400
      }, 400);
    }

    const { careerPathId, difficulty } = requestData;
    
    // Validate input
    if (!careerPathId || !difficulty) {
      error('Missing required parameters');
      return res.json({
        success: false,
        error: 'Missing careerPathId or difficulty',
        statusCode: 400
      }, 400);
    }

    if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      error('Invalid difficulty level');
      return res.json({
        success: false,
        error: 'Invalid difficulty level',
        statusCode: 400
      }, 400);
    }

    // Fetch career path
    let careerPath;
    try {
      careerPath = await databases.getDocument(
        config.databaseId,
        config.careerPathsCollectionId,
        careerPathId
      );
      log(`Fetched career path: ${careerPath.title}`);
    } catch (e) {
      error(`Failed to fetch career path: ${e.message}`);
      return res.json({
        success: false,
        error: 'Career path not found',
        statusCode: 404
      }, 404);
    }

    // Initialize Gemini
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        }
      });

      const prompt = `Generate 3 ${difficulty} projects for "${careerPath.title}" career.
Return only valid JSON array with objects containing:
- title: Project name
- objectives: Array of 3 learning goals
- steps: Array of 5 implementation steps
- tools: Array of required tools
- timeCommitment: Time estimate
- realWorldRelevance: Why it matters

Format: JSON array only, no extra text.`;

      // Generate content
      log('Generating projects with Gemini...');
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      log('Received response from Gemini');

      // Parse and validate projects
      let projects;
      try {
        const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        projects = JSON.parse(cleanedResponse);
        
        if (!Array.isArray(projects) || projects.length === 0) {
          throw new Error('Empty projects array');
        }
      } catch (parseError) {
        error(`Failed to parse projects: ${parseError.message}`);
        return res.json({
          success: false,
          error: 'Failed to parse AI response',
          rawResponse: responseText,
          statusCode: 500
        }, 500);
      }

      // Create final response
      const response = {
        success: true,
        statusCode: 200,
        projects: projects.map(project => ({
          title: project.title || `${careerPath.title} Project`,
          objectives: project.objectives || ['Learn relevant skills', 'Build practical experience'],
          steps: project.steps || ['Plan the project', 'Implement solution', 'Test and refine'],
          tools: project.tools || ['Basic tools for ' + careerPath.title],
          timeCommitment: project.timeCommitment || '2-3 weeks',
          realWorldRelevance: project.realWorldRelevance || 'Builds practical skills for the field',
          ...project
        })),
        careerPath: {
          id: careerPath.$id,
          title: careerPath.title
        },
        difficulty: difficulty
      };

      log('Successfully generated projects');
      return res.json(response);

    } catch (err) {
      error(`AI Generation Error: ${err.message}`);
      return res.json({
        success: false,
        error: 'Failed to generate projects',
        statusCode: 500
      }, 500);
    }

  } catch (err) {
    error(`Unexpected Error: ${err.message}`);
    return res.json({
      success: false,
      error: 'Internal server error',
      statusCode: 500
    }, 500);
  }
};