/**
 * Generate-Projects Serverless Function
 * 
 * This function receives a careerPathId and difficulty level, fetches the corresponding career path from Appwrite,
 * and uses Google Gemini AI to generate 3 project ideas tailored to that career and difficulty.
 * It ensures the output is a valid JSON array with strict structure, repairing or falling back to default projects if needed.
 * The function is robust to malformed AI output and always returns 3 projects, with clear error handling and logging.
 * 
 * Main Steps:
 * 1. Parse and validate input (careerPathId, difficulty).
 * 2. Fetch the career path document from Appwrite.
 * 3. Prompt Gemini AI to generate 3 projects for the given career and difficulty.
 * 4. Parse and validate the AI's JSON output, repairing if necessary.
 * 5. If AI fails, generate fallback projects.
 * 6. Return a structured JSON response with projects and metadata.
 */

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

// Foolproof JSON extraction and parsing function
function extractAndParseJSON(responseText) {
  try {
    // Step 1: Remove markdown code blocks
    let cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Step 2: Find JSON array boundaries
    const startIndex = cleanedResponse.indexOf('[');
    const lastIndex = cleanedResponse.lastIndexOf(']');
    
    if (startIndex === -1 || lastIndex === -1 || startIndex >= lastIndex) {
      throw new Error('No valid JSON array found in response');
    }
    
    // Extract the JSON array part
    const jsonPart = cleanedResponse.substring(startIndex, lastIndex + 1);
    
    // Step 3: Try direct parsing first
    try {
      const parsed = JSON.parse(jsonPart);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (directParseError) {
      console.log('Direct parsing failed, attempting repair...');
    }
    
    // Step 4: Repair common JSON issues
    let repairedJSON = jsonPart;
    
    // Fix unescaped quotes in strings
    repairedJSON = repairedJSON.replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":');
    
    // Fix unescaped newlines and tabs
    repairedJSON = repairedJSON.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
    
    // Fix trailing commas
    repairedJSON = repairedJSON.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix unescaped backslashes
    repairedJSON = repairedJSON.replace(/\\/g, '\\\\');
    
    // Try parsing the repaired JSON
    try {
      const parsed = JSON.parse(repairedJSON);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (repairParseError) {
      console.log('Repair parsing failed, using fallback...');
    }
    
    // Step 5: Last resort - manual extraction with regex
    const projectMatches = [...repairedJSON.matchAll(/{[^{}]*}/g)];
    if (projectMatches.length === 0) {
      throw new Error('No project objects found in response');
    }
    
    const extractedProjects = [];
    for (const match of projectMatches) {
      try {
        const project = JSON.parse(match[0]);
        extractedProjects.push(project);
      } catch (e) {
        // Skip malformed individual projects
        continue;
      }
    }
    
    if (extractedProjects.length > 0) {
      return extractedProjects;
    }
    
    throw new Error('Failed to extract any valid projects from response');
    
  } catch (error) {
    console.error('JSON extraction error:', error);
    throw error;
  }
}

// Fallback projects generator
function generateFallbackProjects(careerTitle, difficulty) {
  const timeEstimates = {
    beginner: '1-2 weeks',
    intermediate: '2-3 weeks',
    advanced: '3-4 weeks'
  };
  
  return [
    {
      title: `${careerTitle} Foundation Project`,
      objectives: [
        `Learn core ${careerTitle.toLowerCase()} concepts`,
        'Build practical experience',
        'Develop problem-solving skills'
      ],
      steps: [
        'Research and plan the project',
        'Set up development environment',
        'Implement core functionality',
        'Test and debug',
        'Document and present results'
      ],
      tools: [`Industry-standard ${careerTitle.toLowerCase()} tools`, 'Development environment', 'Testing frameworks'],
      timeCommitment: timeEstimates[difficulty],
      realWorldRelevance: `This project simulates real-world ${careerTitle.toLowerCase()} scenarios and builds relevant skills for the industry.`
    },
    {
      title: `${careerTitle} Practical Application`,
      objectives: [
        'Apply theoretical knowledge',
        'Build a portfolio piece',
        'Demonstrate technical skills'
      ],
      steps: [
        'Define project requirements',
        'Create project architecture',
        'Develop and implement solution',
        'Perform quality assurance',
        'Deploy and maintain'
      ],
      tools: [`${careerTitle} development tools`, 'Project management software', 'Version control'],
      timeCommitment: timeEstimates[difficulty],
      realWorldRelevance: `Provides hands-on experience with real ${careerTitle.toLowerCase()} challenges and workflows.`
    },
    {
      title: `${careerTitle} Challenge Project`,
      objectives: [
        'Solve complex problems',
        'Demonstrate advanced skills',
        'Prepare for career opportunities'
      ],
      steps: [
        'Analyze problem requirements',
        'Design comprehensive solution',
        'Implement with best practices',
        'Optimize and refine',
        'Present and document'
      ],
      tools: [`Advanced ${careerTitle.toLowerCase()} tools`, 'Analytics platforms', 'Collaboration tools'],
      timeCommitment: timeEstimates[difficulty],
      realWorldRelevance: `Mirrors the complexity and requirements of professional ${careerTitle.toLowerCase()} work.`
    }
  ];
}

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
        model: "gemini-2.0-flash",
      });

      const prompt = `Generate exactly 3 ${difficulty} projects for "${careerPath.title}" career path.

CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON array - no additional text, explanations, or formatting
2. Each project must have EXACTLY these fields: title, objectives, steps, tools, timeCommitment, realWorldRelevance
3. objectives: array of exactly 3 strings
4. steps: array of exactly 5 strings  
5. tools: array of strings
6. Ensure all strings are properly escaped (use \\" for quotes, \\n for newlines)
7. No trailing commas in arrays or objects

Example format:
[
  {
    "title": "Project Name",
    "objectives": ["Goal 1", "Goal 2", "Goal 3"],
    "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
    "tools": ["Tool 1", "Tool 2"],
    "timeCommitment": "2-3 weeks",
    "realWorldRelevance": "Explanation of relevance"
  }
]

Generate for ${careerPath.title} at ${difficulty} level:`;

      // Generate content with retry mechanism and thinking config
      let projects;
      let usedFallback = false;
      
      try {
        log('Generating projects with Gemini...');
        
        // Use thinking configuration for faster, more focused responses
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 3000,
            temperature: 0.7,
            // Enable thinking with a moderate budget for balanced speed and quality
            thinkingConfig: {
              thinkingBudget: 512,  // Moderate thinking budget for faster response while maintaining quality
              // For even faster responses, you can reduce to 256 or use 0 to disable thinking entirely:
               thinkingBudget: 0  // Disable thinking for maximum speed
              // For dynamic thinking (slower but potentially higher quality):
              // thinkingBudget: -1  // Enable dynamic thinking
            }
          }
        });
        
        const responseText = result.response.text();
        log('Received response from Gemini');
        
        // Use robust JSON parsing
        projects = extractAndParseJSON(responseText);
        
        // Validate projects structure
        if (!Array.isArray(projects) || projects.length === 0) {
          throw new Error('Invalid projects array structure');
        }
        
        // Validate each project has required fields
        for (let i = 0; i < projects.length; i++) {
          const project = projects[i];
          if (!project.title || !Array.isArray(project.objectives) || 
              !Array.isArray(project.steps) || !Array.isArray(project.tools) ||
              !project.timeCommitment || !project.realWorldRelevance) {
            throw new Error(`Project ${i + 1} missing required fields`);
          }
        }
        
        log('Successfully parsed and validated projects');
        
      } catch (aiError) {
        log(`AI generation failed: ${aiError.message}, using fallback`);
        projects = generateFallbackProjects(careerPath.title, difficulty);
        usedFallback = true;
      }

      // Ensure we always have exactly 3 projects
      if (projects.length < 3) {
        const fallbackProjects = generateFallbackProjects(careerPath.title, difficulty);
        projects = [...projects, ...fallbackProjects.slice(projects.length)];
      } else if (projects.length > 3) {
        projects = projects.slice(0, 3);
      }

      // Create final response with guaranteed structure
      const response = {
        success: true,
        statusCode: 200,
        projects: projects.map((project, index) => ({
          title: project.title || `${careerPath.title} Project ${index + 1}`,
          objectives: Array.isArray(project.objectives) && project.objectives.length > 0 
            ? project.objectives.slice(0, 3) 
            : ['Learn relevant skills', 'Build practical experience', 'Develop problem-solving abilities'],
          steps: Array.isArray(project.steps) && project.steps.length > 0 
            ? project.steps.slice(0, 5) 
            : ['Plan the project', 'Set up environment', 'Implement solution', 'Test and refine', 'Document results'],
          tools: Array.isArray(project.tools) && project.tools.length > 0 
            ? project.tools 
            : [`${careerPath.title} development tools`, 'Project management software'],
          timeCommitment: project.timeCommitment || (difficulty === 'beginner' ? '1-2 weeks' : difficulty === 'intermediate' ? '2-3 weeks' : '3-4 weeks'),
          realWorldRelevance: project.realWorldRelevance || `Builds practical skills relevant to ${careerPath.title} career`,
          ...project
        })),
        careerPath: {
          id: careerPath.$id,
          title: careerPath.title
        },
        difficulty: difficulty,
        usedFallback: usedFallback
      };

      log('Successfully generated projects response');
      return res.json(response);

    } catch (err) {
      error(`AI Generation Error: ${err.message}`);
      
      // Return fallback projects even if AI completely fails
      const fallbackProjects = generateFallbackProjects(careerPath.title, difficulty);
      
      return res.json({
        success: true,
        statusCode: 200,
        projects: fallbackProjects,
        careerPath: {
          id: careerPath.$id,
          title: careerPath.title
        },
        difficulty: difficulty,
        usedFallback: true,
        warning: 'AI generation failed, using fallback projects'
      });
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