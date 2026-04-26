#!/bin/bash

UA="MushroomBot/1.0 (educational)"

download_mushroom() {
    local idx="$1"
    local title="$2"
    local dir="/tmp/agent/images/$idx"
    local count=0
    
    # Get images from images list (skip summary endpoint due to rate limiting)
    images=$(curl -sLA "$UA" "https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=$title&imlimit=15&format=json" 2>/dev/null)
    
    file_titles=$(echo "$images" | jq -r '.query.pages[].images[]?.title // empty' 2>/dev/null | 
        grep -iE '\.(jpg|jpeg|png)$' |
        grep -v -iE '(Commons-logo|OOjs_UI|Question_book|Wiktionary|icon|Flag_|Map_of|Disambig|Edit-clear)' |
        head -3)
    
    img_num=1
    while IFS= read -r file_title; do
        [ -z "$file_title" ] && continue
        
        # Encode file title
        encoded_title=$(printf %s "$file_title" | jq -sRr @uri 2>/dev/null)
        
        # Get image info
        img_info=$(curl -sLA "$UA" "https://en.wikipedia.org/w/api.php?action=query&titles=$encoded_title&prop=imageinfo&iiprop=url&format=json" 2>/dev/null)
        img_url=$(echo "$img_info" | jq -r '.query.pages[].imageinfo[0].url // empty' 2>/dev/null)
        
        if [ -n "$img_url" ] && [ "$img_url" != "null" ]; then
            if curl -sLA "$UA" -o "$dir/img_$img_num.jpg" "$img_url" 2>/dev/null; then
                size=$(stat -c%s "$dir/img_$img_num.jpg" 2>/dev/null)
                if [ "$size" -lt 3145728 ]; then
                    ((count++))
                    ((img_num++))
                    [ $img_num -gt 3 ] && break
                else
                    rm "$dir/img_$img_num.jpg"
                fi
            fi
        fi
        sleep 1
    done <<< "$file_titles"
    
    echo "$idx: $count"
}

export -f download_mushroom
export UA

# 5-second delays between mushrooms
download_mushroom 81 Prototaxites && sleep 5
download_mushroom 82 Hair_ice && sleep 5
download_mushroom 83 Tuber_magnatum && sleep 5
download_mushroom 84 Phallus_indusiatus && sleep 5
download_mushroom 85 Entoloma_hochstetteri && sleep 5
download_mushroom 86 Entoloma_rhodopolium && sleep 5
download_mushroom 87 Lycoperdon_nigrescens && sleep 5
download_mushroom 88 Morchella_esculenta && sleep 5
download_mushroom 89 Omphalotus_olearius && sleep 5
download_mushroom 90 Flammulina_velutipes
