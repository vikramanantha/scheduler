import json
import re
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

def parse_course_details(title_text, desc_text):
    """
    Parses raw text from the 'courseblocktitle' and 'courseblockdesc' 
    into a structured dictionary.
    """
    # 1. Parse Title: "EECS 281. Data Structures and Algorithms"
    # Regex looks for "Subject Code ###." followed by the Name
    # Example match: Group 1="EECS 281", Group 2="Data Structures..."
    match = re.match(r"([A-Z]+\s?\d{3})\.?(.*)", title_text, re.IGNORECASE)
    
    if not match:
        return None

    # Normalize Code (e.g. "EECS 281")
    raw_code = match.group(1).upper()
    code_parts = re.match(r"([A-Z]+)\s?(\d{3})", raw_code)
    if code_parts:
        course_code = f"{code_parts.group(1)} {code_parts.group(2)}"
    else:
        course_code = raw_code

    course_name = match.group(2).strip().strip('.')

    # 2. Extract Credits
    # Looks for "(4 credits)" or "1-4 credits" in the description
    credits_match = re.search(r"\((\d+-?\d*)\s+credits?\)", desc_text, re.IGNORECASE)
    credits = credits_match.group(1) if credits_match else "3"

    # 3. Extract Prerequisites Text (Combining Enforced and Advisory)
    full_prereq_text = ""
    
    # Enforced Prereqs
    enforced_match = re.search(r"Enforced Prerequisite:([^.]*)", desc_text, re.IGNORECASE)
    if enforced_match:
        full_prereq_text += enforced_match.group(1).strip() + " "
    
    # Advisory Prereqs
    other_prereq_match = re.search(r"(?<!Enforced )Prerequisite:([^.]*)", desc_text, re.IGNORECASE)
    if other_prereq_match:
        full_prereq_text += other_prereq_match.group(1).strip()

    # 4. Extract Prerequisite Codes (for your app logic)
    # Finds any pattern like "MATH 115", "EECS 281"
    found_prereqs = re.findall(r"([A-Z]{2,})\s?(\d{3})", full_prereq_text, re.IGNORECASE)
    
    formatted_prereqs = []
    for p_dept, p_num in found_prereqs:
        p_code = f"{p_dept.upper()} {p_num}"
        # Avoid self-reference (e.g. "No credit in EECS 280")
        if p_code != course_code: 
            formatted_prereqs.append(p_code)
    
    formatted_prereqs = list(set(formatted_prereqs))

    # 5. Generate Atlas Link
    atlas_slug = course_code.replace(" ", "%20")
    atlas_link = f"https://atlas.ai.umich.edu/course/{atlas_slug}/"
    
    # 6. Estimate Workload (Simple heuristic)
    workload = 1.0
    try:
        # If max credits >= 4, mark as heavier
        max_credits = float(credits.split('-')[-1])
        if max_credits >= 4:
            workload = 1.5
    except:
        pass

    return {
        "id": course_code.replace(" ", "").lower(), # e.g. "eecs281"
        "code": course_code,
        "name": course_name,
        "credits": credits,
        "workload": workload,
        "offered": "Both", # Default
        "prereqs": formatted_prereqs,
        "atlas_link": atlas_link
    }

def main():
    # Setup Chrome options
    options = webdriver.ChromeOptions()
    # options.add_argument('--headless') # Uncomment to run in background
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    try:
        # URL to scrape
        url = "https://bulletin.engin.umich.edu/courses/eecs/"
        # NOTE: To scrape the local file you uploaded, use:
        # url = "file:///absolute/path/to/your/eecs.html"
        
        print(f"Navigating to {url}...")
        driver.get(url)

        # Wait for the course blocks to load
        wait = WebDriverWait(driver, 10)
        
        # 1. FIND ALL COURSE BLOCKS
        # Based on your HTML structure: <div class="courseblock">...</div>
        course_elements = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "courseblock")))
        print(f"Found {len(course_elements)} course blocks.")
        
        all_courses = []
        
        for course_el in course_elements:
            try:
                # 2. EXTRACT TITLE AND DESCRIPTION
                # Based on your structure: .courseblocktitle and .courseblockdesc
                title_el = course_el.find_element(By.CLASS_NAME, "courseblocktitle")
                desc_el = course_el.find_element(By.CLASS_NAME, "courseblockdesc")
                
                title_text = title_el.text.strip()
                desc_text = desc_el.text.strip()
                
                # 3. PARSE DETAILS
                course_data = parse_course_details(title_text, desc_text)
                
                if course_data:
                    all_courses.append(course_data)
                    print(f"  + Scraped: {course_data['code']}")
            
            except Exception as e:
                # Sometimes a block might be malformed or empty
                continue

        # Save to JSON
        output_file = 'courses.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(all_courses, f, indent=4)
        
        print(f"\nSuccess! Scraped {len(all_courses)} courses.")
        print(f"Data saved to {output_file}")

    finally:
        driver.quit()

if __name__ == "__main__":
    main()