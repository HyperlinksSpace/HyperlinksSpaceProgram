## AI & Search bar input behaviour

This document describes how the text in the global AI & Search bottom bar should behave as the user types, matching the Flutter implementation.

---

### 1. Reference states (pictures sequence)

The reference images show a sequence of states for a long line of text; they illustrate how the bar grows and then turns into a scrolling window:

1. **Full text, no bar**  
   Long multi‑line text fills a tall content area. This is effectively the raw content without the constraints of the bottom bar.

2. **Initial bar: single line + arrow**  
   - Only a single line of text is visible.  
   - The text baseline is horizontally aligned with the apply arrow icon on the right.  
   - There is empty space above the line; bar height is at its minimum.

3. **Unconstrained multi‑line text**  
   - Text has grown to multiple lines in a taller, unbounded view (again, this is the raw content).  

4. **Growing bar: multiple lines + arrow**  
   - The bottom bar has increased in height to show multiple lines.  
   - As lines are added, the **space above the text shrinks**, but the **last visible line remains on the same vertical level as the arrow**.  
   - Visually, the bar grows upwards while the arrow + last line baseline stays fixed.

5. **Very long text, no bar**  
   - The entire long text block is visible in a tall area, showing how much total content exists.

6. **Capped bar height: scrolling window**  
   - The bottom bar height is now capped (e.g. at 180 px).  
   - The visible area becomes a **fixed‑height window** into the text:
     - Older lines at the top continue moving up and eventually disappear under the **top edge** of the bar as more text is entered.
     - The **last visible line stays aligned with the arrow baseline** at the bottom of the bar. The typing position does not move vertically once the bar has reached its maximum height.

---

### 2. Detailed behaviour by line count

#### 1–7 lines: growing bar

- For each new line from 1 up to 7:
  - The **bottom bar height increases** by exactly one line height (20 px).  
  - The height formula is:
    \[
    \text{height} = 20\text{ (top padding)} + N \times 20\text{ (lines)} + 20\text{ (bottom padding)}, \quad 1 \le N \le 7.
    \]
  - The **last line is always on the same baseline as the arrow** on the right.
  - Visually, the bar grows **upwards**; the arrow + last line stay fixed at the bottom.

#### 8 lines: text reaches the top edge

- When the **8th line** appears:
  - The text block now reaches the **top edge of the bottom bar**.  
  - The bar height is at its **maximum** (e.g. 180 px).  
  - All 8 lines are still visible at once, from the top edge down to the arrow.

#### 9 lines: full‑height text area, one line hidden

- When the **9th line** appears:
  - The **scrollable text area is exactly 180 px high**, the same as the bar.  
  - The **last line remains aligned with the arrow** at the bottom.  
  - The **topmost line (1st)** is now hidden just above the top edge of the bar.  
  - If the user scrolls, they can reveal all 9 lines, because:
    \[
    9 \times 20\text{ px} = 180\text{ px},
    \]
    so all 9 lines can fit into the bar’s full height when scrolled to the appropriate position.

#### 9+ lines: fixed bar, 9‑line scrolling window

- For **any number of lines ≥ 9**:
  - The bar height stays fixed at its maximum (e.g. 180 px).  
  - The **scrollable area always occupies the full bar height** (180 px).  
  - At any moment:
    - Up to **9 lines are visible** in the window.  
    - The **bottom (last visible) line stays aligned with the arrow** while typing.  
    - Older lines scroll upwards and are hidden above the top edge; the user can scroll to reveal them.

---

### 3. Implementation‑oriented summary

- **Line height & padding**
  - Line height: 20 px.
  - Top padding: 20 px.
  - Bottom padding: 20 px.

- **Bar growth vs. scroll mode**
  - For 1–7 lines, bar height grows; arrow + last line baseline are fixed.  
  - From the 8th line onward, the bar stays at max height; the input switches to a scrollable window that:
    - Always keeps the caret / last line baseline aligned with the arrow.
    - Hides older lines under the top edge while allowing them to be revealed by scrolling.

