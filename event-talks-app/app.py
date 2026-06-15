import time
import urllib.request
import xml.etree.ElementTree as ET
import re
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Simple in-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_TTL = 300  # 5 minutes

def parse_release_notes():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    
    with urllib.request.urlopen(req, timeout=10) as response:
        xml_data = response.read()
        
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    
    for entry in root.findall('atom:entry', ns):
        title_element = entry.find('atom:title', ns)
        updated_element = entry.find('atom:updated', ns)
        content_element = entry.find('atom:content', ns)
        
        date_str = title_element.text if title_element is not None else "Unknown Date"
        updated_str = updated_element.text if updated_element is not None else ""
        content_html = content_element.text if content_element is not None else ""
        
        # Parse the HTML content to find separate <h3>...</h3> blocks
        # Google release notes typically have:
        # <h3>Feature</h3>
        # <p>...</p>
        matches = list(re.finditer(r'<h3>(.*?)</h3>', content_html))
        
        if not matches:
            # If no h3 blocks found, treat the whole content as one general note
            plain_description = re.sub(r'<[^>]+>', '', content_html).strip()
            entries.append({
                "date": date_str,
                "updated": updated_str,
                "type": "General",
                "content_html": content_html,
                "description_text": plain_description
            })
            continue
            
        for i, match in enumerate(matches):
            update_type = match.group(1).strip()
            start_idx = match.end()
            end_idx = matches[i+1].start() if i + 1 < len(matches) else len(content_html)
            update_html = content_html[start_idx:end_idx].strip()
            
            # Extract plain text for tweeting and searching
            plain_description = re.sub(r'<[^>]+>', '', update_html)
            # Normalize whitespace
            plain_description = re.sub(r'\s+', ' ', plain_description).strip()
            
            # Unique ID for UI rendering and interactions
            entry_id = f"{date_str.replace(' ', '_').lower()}_{i}"
            
            entries.append({
                "id": entry_id,
                "date": date_str,
                "updated": updated_str,
                "type": update_type,
                "content_html": update_html,
                "description_text": plain_description
            })
            
    return entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or not cache["data"] or (now - cache["last_fetched"] > CACHE_TTL):
        try:
            cache["data"] = parse_release_notes()
            cache["last_fetched"] = now
        except Exception as e:
            # If fetch fails but we have cached data, return cached data with warning
            if cache["data"]:
                return jsonify({
                    "notes": cache["data"],
                    "error": f"Failed to refresh feed: {str(e)}. Showing cached data.",
                    "cached_at": cache["last_fetched"]
                }), 200
            return jsonify({"error": f"Failed to fetch release notes: {str(e)}"}), 500
            
    return jsonify({
        "notes": cache["data"],
        "cached_at": cache["last_fetched"]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
