const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

const MAX_PAGES = 2;
const BASE_URL = 'https://catalogue.usc.edu';
const CATALOG_ID = '12';

async function scrapeCourseListPage(pageNumber) {
  const url = `${BASE_URL}/content.php?catoid=${CATALOG_ID}&catoid=${CATALOG_ID}&navoid=4245&filter%5Bitem_type%5D=3&filter%5Bonly_active%5D=1&filter%5B3%5D=1&filter%5Bcpage%5D=${pageNumber}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      }
    });

    const $ = cheerio.load(response.data);
    const courseLinks = [];

    $('a[href^="preview_course_nopop.php?catoid=12&coid="]').each((_, element) => {
      const href = $(element).attr('href');
      const [, queryString] = href.split('?');
      const params = new URLSearchParams(queryString);
      courseLinks.push({
        catoid: params.get('catoid'),
        coid: params.get('coid')
      });
    });

    console.log(`Found ${courseLinks.length} courses on page ${pageNumber}`);
    return courseLinks;
  } catch (error) {
    console.error(`Error scraping page ${pageNumber}:`, error.message);
    return [];
  }
}

async function scrapeAllCoursePages() {
  const allCourseLinks = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const courseLinks = await scrapeCourseListPage(page);
    allCourseLinks.push(...courseLinks);
    console.log(`Scraped page ${page} of ${MAX_PAGES}`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }
  
  console.log(`Total courses found: ${allCourseLinks.length}`);
  await fs.writeFile('course_ids.json', JSON.stringify(allCourseLinks, null, 2));
  console.log('Course links saved to course_ids.json');
  
  return allCourseLinks;
}

async function scrapeCourseDetails(catoid, coid) {
  const url = `${BASE_URL}/ajax/preview_course.php?catoid=${catoid}&coid=${coid}&show`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    const $ = cheerio.load(response.data);
    const courseElement = $('body > table > tbody > tr > td > div:nth-child(2)');
    const courseDetails = { url };

    courseDetails.title = courseElement.find('h3').text().trim();

    courseElement.contents().each((_, element) => {
      if (element.type === 'text') {
        const text = element.data.trim();
        if (text.includes(':')) {
          const [key, value] = text.split(':').map(item => item.trim());
          if (key && value) {
            courseDetails[key === 'Satisfies New General Education' ? 'GE satisfied' : key] = value;
          }
        }
      }
    });

    courseDetails['GE satisfied'] = courseDetails['GE satisfied'] || '';
    return courseDetails;
  } catch (error) {
    console.error(`Error scraping details for course ${coid}:`, error.message);
    return null;
  }
}

async function scrapeAllCourseDetails(courseLinks) {
  const allCourseDetails = [];
  
  let processedCount = 0;
  const totalCourses = courseLinks.length;

  for (const course of courseLinks) {
    processedCount++;
    console.log(`Processing course ${processedCount}/${totalCourses}: ${course.catoid}-${course.coid}`);

    const details = await scrapeCourseDetails(course.catoid, course.coid);
    if (details) {
      allCourseDetails.push({ ...course, details });
      console.log(`Successfully scraped: ${details.title}`);
      console.log(details);
    } else {
      console.warn(`Failed to scrape details for course ${course.catoid}-${course.coid}`);
    }

    if (processedCount % 10 === 0) {
      console.log(`Progress: ${processedCount}/${totalCourses} courses processed`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }

  console.log(`Total course details scraped: ${allCourseDetails.length}`);
  await fs.writeFile('course_details.json', JSON.stringify(allCourseDetails, null, 2));
  console.log('Course details saved to course_details.json');
  
  console.log('Sample of scraped data:');
  console.log(JSON.stringify(allCourseDetails.slice(0, 3), null, 2));

  return allCourseDetails;
}

async function saveCourseDetailsToCSV(courseDetails) {
  const columns = ['url', 'title', 'Units', 'Terms Offered', 'Registration Restriction', 'Instruction Mode', 'Grading Option', 'GE satisfied', 'Max Units'];
  let csvContent = columns.join(',') + '\n';

  courseDetails.forEach(course => {
    const row = columns.map(key => {
      const value = course.details[key] || '';
      return `"${value.replace(/"/g, '""')}"`;
    });
    csvContent += row.join(',') + '\n';
  });

  await fs.writeFile('course_details.csv', csvContent);
  console.log('Course details saved to course_details.csv');
}

async function main() {
  try {
    console.log('Starting to scrape all course pages...');
    const allCourseLinks = await scrapeAllCoursePages();
    
    console.log('Starting to scrape all course details...');
    const allCourseDetails = await scrapeAllCourseDetails(allCourseLinks);
    
    await saveCourseDetailsToCSV(allCourseDetails);
    
    console.log('Scraping process completed successfully.');
  } catch (error) {
    console.error('An error occurred during the scraping process:', error.message);
    process.exit(1);
  }
}

main();