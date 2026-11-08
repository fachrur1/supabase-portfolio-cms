import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Paths
const ROOT_DIR = path.resolve(process.cwd());
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_API_DIR = path.join(PUBLIC_DIR, 'api');
const OUTPUT_DATA_JSON = path.join(PUBLIC_API_DIR, 'data.json');

// Ensure public/api directory exists
if (!fs.existsSync(PUBLIC_API_DIR)) {
  fs.mkdirSync(PUBLIC_API_DIR, { recursive: true });
}

async function buildCMS() {
  console.log('Building CMS data from modular files...');
  
  const monolithicDataPath = path.join(CONTENT_DIR, 'data.json');
  if (fs.existsSync(monolithicDataPath)) {
    console.log('Detected monolithic content/data.json, using it instead of modular files...');
    const rawData = fs.readFileSync(monolithicDataPath, 'utf-8');
    fs.writeFileSync(OUTPUT_DATA_JSON, rawData);
    console.log('✅ CMS data built successfully! Output:', OUTPUT_DATA_JSON);
  } else {
    // 1. Read Core Data
    const siteRaw = fs.readFileSync(path.join(CONTENT_DIR, 'core', 'site.json'), 'utf-8');
    const siteData = JSON.parse(siteRaw);
    
    const educationRaw = fs.readFileSync(path.join(CONTENT_DIR, 'core', 'education.json'), 'utf-8');
    const educationData = JSON.parse(educationRaw);
    
    const skillsRaw = fs.readFileSync(path.join(CONTENT_DIR, 'core', 'skills.json'), 'utf-8');
    const skillsData = JSON.parse(skillsRaw);

    // 2. Read Experience (Organizations)
    let orgData = [];
    try {
        const orgRaw = fs.readFileSync(path.join(CONTENT_DIR, 'experience', 'organizations.json'), 'utf-8');
        orgData = JSON.parse(orgRaw);
    } catch (e) {
        console.log("No organizations data found.");
    }

    // 3. Read Media (Photography)
    let photoData = [];
    try {
        const photoRaw = fs.readFileSync(path.join(CONTENT_DIR, 'media', 'photography.json'), 'utf-8');
        photoData = JSON.parse(photoRaw);
    } catch(e) {
        console.log("No photography data found.");
    }

    // Assemble base data
    const baseData: any = {
      hero: siteData.hero,
      about: siteData.about,
      contact: siteData.contact,
      education: educationData,
      skills: skillsData,
      organizations: orgData,
      photography: photoData,
      works: []
    };

    // 4. Read Projects (Markdown)
    const newWorks: any[] = [];
    
    // Helper to read markdown files
    const readMarkdownProjects = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          readMarkdownProjects(fullPath);
        } else if (file.endsWith('.md')) {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const { data: frontmatter, content } = matter(fileContent);
          
          let descParts = [];
          if (frontmatter.role) descParts.push(`Role: ${frontmatter.role}`);
          if (frontmatter.organization) descParts.push(`Organization: ${frontmatter.organization}`);
          if (frontmatter.location) descParts.push(`Location: ${frontmatter.location}`);
          if (frontmatter.duration) descParts.push(`Duration: ${frontmatter.duration}`);
          if (frontmatter.focus) descParts.push(`Focus: ${frontmatter.focus}`);
          if (frontmatter.tools && frontmatter.tools.length) descParts.push(`Tools: ${frontmatter.tools.join(', ')}`);
          
          const generatedDesc = descParts.join('\n\n') + (descParts.length > 0 ? '\n\n' : '') + content.trim();

          newWorks.push({
            _fileNumber: parseInt(file.split('-')[0]) || 99, // use file prefix to sort
            category: frontmatter.category || '',
            title: frontmatter.title,
            short_desc: frontmatter.short_desc || '',
            description: generatedDesc,
            tags: frontmatter.tools || [],
            image_id: frontmatter.image_id || '',
            gallery_ids: frontmatter.gallery_ids || []
          });
        }
      }
    };

    readMarkdownProjects(path.join(CONTENT_DIR, 'projects'));
    
    // Sort works by file prefix
    newWorks.sort((a, b) => a._fileNumber - b._fileNumber);
    // remove temporary sorting field
    newWorks.forEach(w => delete w._fileNumber);

    baseData.works = newWorks;

    // 5. Write to public/api/data.json
    fs.writeFileSync(OUTPUT_DATA_JSON, JSON.stringify(baseData, null, 2));
    console.log('✅ CMS data built successfully! Output:', OUTPUT_DATA_JSON);
  }

  // 6. Copy other JSON files (like images.json) so the frontend can still fetch them
  const otherFiles = ['images.json', 'settings.json', 'motion.json', 'render3d.json'];
  for (const file of otherFiles) {
    const src = path.join(CONTENT_DIR, file);
    const dest = path.join(PUBLIC_API_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✅ Copied ${file} to public/api/`);
    }
  }
}

buildCMS();
