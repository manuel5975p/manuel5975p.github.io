#!/bin/bash

UA="MushroomBot/1.0 (educational)"

download_mushroom() {
    local idx="$1"
    local title="$2"
    local dir="/tmp/agent/images/$idx"
    local count=0
    
    sleep 2
    
    # 1. Get lead image from summary endpoint
    summary=$(curl -sLA "$UA" "https://en.wikipedia.org/api/rest_v1/page/summary/$title" 2>/dev/null)
    img_url=$(echo "$summary" | jq -r '.originalimage.source // .thumbnail.source // empty' 2>/dev/null)
    
    if [ -n "$img_url" ] && [ "$img_url" != "null" ]; then
        if curl -sLA "$UA" -o "$dir/img_1.jpg" "$img_url" 2>/dev/null; then
            size=$(stat -c%s "$dir/img_1.jpg" 2>/dev/null)
            if [ -z "$size" ] || [ "$size" -lt 3145728 ]; then
                ((count++))
            else
                rm "$dir/img_1.jpg"
            fi
        fi
    fi
    
    sleep 2
    
    # 2. Get more images from images list
    images=$(curl -sLA "$UA" "https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=$title&imlimit=15&format=json" 2>/dev/null)
    
    file_titles=$(echo "$images" | jq -r '.query.pages[].images[]?.title // empty' 2>/dev/null | 
        grep -iE '\.(jpg|jpeg|png)$' |
        grep -v -iE '(Commons-logo|OOjs_UI|Question_book|Wiktionary|icon|Flag_|Map_of|Disambig|Edit-clear)' |
        head -2)
    
    img_num=2
    while IFS= read -r file_title; do
        [ -z "$file_title" ] && continue
        
        sleep 1
        
        # Encode file title
        encoded_title=$(printf %s "$file_title" | jq -sRr @uri 2>/dev/null)
        
        # Get image info
        img_info=$(curl -sLA "$UA" "https://en.wikipedia.org/w/api.php?action=query&titles=$encoded_title&prop=imageinfo&iiprop=url&format=json" 2>/dev/null)
        img_url=$(echo "$img_info" | jq -r '.query.pages[].imageinfo[0].url // empty' 2>/dev/null)
        
        if [ -n "$img_url" ] && [ "$img_url" != "null" ]; then
            if curl -sLA "$UA" -o "$dir/img_$img_num.jpg" "$img_url" 2>/dev/null; then
                size=$(stat -c%s "$dir/img_$img_num.jpg" 2>/dev/null)
                if [ -z "$size" ] || [ "$size" -lt 3145728 ]; then
                    ((count++))
                    ((img_num++))
                    [ $img_num -gt 3 ] && break
                else
                    rm "$dir/img_$img_num.jpg"
                fi
            fi
        fi
    done <<< "$file_titles"
    
    echo "$idx: $count"
}

export -f download_mushroom
export UA

# Sequential processing with delays to avoid rate limiting
(
for line in "81 Prototaxites" "82 Hair_ice" "83 Tuber_magnatum" "84 Phallus_indusiatus" "85 Entoloma_hochstetteri" "86 Entoloma_rhodopolium" "87 Lycoperdon_nigrescens" "88 Morchella_esculenta" "89 Omphalotus_olearius" "90 Flammulina_velutipes"; do
    download_mushroom $line
done
) &

wait
