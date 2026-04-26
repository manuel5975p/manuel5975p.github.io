#!/bin/bash

UA="MushroomBot/1.0"

# Try fetching with very long delays
for mushroom in \
  "81:Prototaxites" \
  "82:Hair_ice" \
  "83:Tuber_magnatum" \
  "84:Phallus_indusiatus" \
  "85:Entoloma_hochstetteri" \
  "86:Entoloma_rhodopolium" \
  "87:Lycoperdon_nigrescens" \
  "88:Morchella_esculenta" \
  "89:Omphalotus_olearius" \
  "90:Flammulina_velutipes"; do
  
  IFS=: read idx title <<< "$mushroom"
  dir="/tmp/agent/images/$idx"
  
  # Query with very long delays between attempts
  echo "Processing $idx ($title)..."
  
  # Try to get images using direct mw api with long timeout
  result=$(timeout 30 curl -sLA "$UA" --connect-timeout 10 \
    "https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${title}&imlimit=15&format=json" 2>/dev/null || echo "{}")
  
  # Extract image titles
  titles=$(echo "$result" | jq -r '.query.pages[].images[]?.title // empty' 2>/dev/null | head -3)
  
  img_count=$(echo "$titles" | wc -l)
  echo "$idx: trying $img_count images"
  
  sleep 15
done
