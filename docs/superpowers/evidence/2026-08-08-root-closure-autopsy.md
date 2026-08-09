# Root-Closure Autopsy — 2026-08-08

**Split:** dev  
**Instrument:** `scripts/root-closure-autopsy.mjs`  
**Question:** For missing gold root spans, what is the largest structure already built, and what pieces sit on the table?

## Counts

| | n | % of gold roots |
|---|---|---|
| Gold roots | 2001 | 100% |
| Root span built | 540 | 27.0% |
| **Root span missing** | **1461** | **73.0%** |
| Non-contiguous | 0 | 0.0% |
| Distinct clusters | 1218 | |

## Piece co-occurrence (missing roots only)

| Pieces on table | n | % of missing |
|---|---|---|
| NP+S | 302 | 20.7% |
| S | 272 | 18.6% |
| NP+VP+S | 158 | 10.8% |
| NP+S+PUNCT | 131 | 9.0% |
| NP | 110 | 7.5% |
| VP+S | 92 | 6.3% |
| NP+VP+S+PUNCT | 90 | 6.2% |
| NP+PUNCT | 89 | 6.1% |
| S+PUNCT | 62 | 4.2% |
| other | 51 | 3.5% |
| PUNCT | 20 | 1.4% |
| VP+S+PUNCT | 17 | 1.2% |
| NP+VP+S+PP+PUNCT | 16 | 1.1% |
| NP+S+PP | 11 | 0.8% |
| NP+S+PP+PUNCT | 10 | 0.7% |

### Closure hypotheses

- **NP and VP both present:** 273 (18.7%) — local subject/predicate may exist without clause closure.
- **Some S already inside span:** 1178 (80.6%) — subclause built; full root span not closed (punct / attachment / combination).

## Largest built type under missing root

| Type | n | % of missing |
|---|---|---|
| S | 923 | 63.2% |
| PROPN | 93 | 6.4% |
| VP | 86 | 5.9% |
| NP | 81 | 5.5% |
| N | 75 | 5.1% |
| ∅ | 46 | 3.1% |
| SCOMMA | 34 | 2.3% |
| APPOS | 29 | 2.0% |
| SBAR | 25 | 1.7% |
| ADJ | 15 | 1.0% |
| PP | 13 | 0.9% |
| CONJS | 4 | 0.3% |

## Top clusters

### 25× — largest=`∅` fill=0 pieces=`∅` fringe=none root=PROPN

- http://www.budgieresearch.com  
  largest `∅` pieces ``
- http://www.4gamer.net/news/image/2005.09/20050920111900_21big.html  
  largest `∅` pieces ``
- http://www.4gamer.net/news/image/2005.09/20050919032951_21big.html  
  largest `∅` pieces ``

### 24× — largest=`PROPN` fill=0.5 pieces=`NP+PROPN` fringe=R root=PROPN

- Marlene Hilliard  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], NP[1-1]` right«Hilliard»
- Joan Woodson  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], NP[1-1]` right«Woodson»
- Christa Winfrey  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], NP[1-1]` right«Winfrey»

### 10× — largest=`∅` fill=0 pieces=`∅` fringe=none root=PUNCT

- ***  
  largest `∅` pieces ``
- ************************************************  
  largest `∅` pieces ``
- ************************************************  
  largest `∅` pieces ``

### 9× — largest=`PROPN` fill=0.33 pieces=`ADV+AUX+COP+N+NP+PROPN` fringe=L root=NUM

- 04/26/2001 07:17 AM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], COP[2-2], AUX[2-2], NP[2-2]` left«04/26/2001 07:17»
- 08/17/2000 11:21 AM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], COP[2-2], AUX[2-2], NP[2-2]` left«08/17/2000 11:21»
- 10/08/99 08:52 AM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], COP[2-2], AUX[2-2], NP[2-2]` left«10/08/99 08:52»

### 9× — largest=`S` fill=0.67 pieces=`S` fringe=R root=NOUN

- Email: franz371...@gmail.com  
  largest `S[0-1]` pieces `S[0-1]` right«franz371...@gmail.com»
- Email: davidr...@optonline.net  
  largest `S[0-1]` pieces `S[0-1]` right«davidr...@optonline.net»
- Email: franz371...@gmail.com  
  largest `S[0-1]` pieces `S[0-1]` right«franz371...@gmail.com»

### 8× — largest=`S` fill=0.8 pieces=`S` fringe=L root=VERB

- i think they are all bark and no bite.  
  largest `S[2-9]` pieces `S[0-2], S[2-9]` left«i think»
- How is it going?  
  largest `S[1-4]` pieces `S[0-2], S[1-4]` left«How»
- How are you doing?  
  largest `S[1-4]` pieces `S[0-2], S[1-4]` left«How»

### 8× — largest=`∅` fill=0 pieces=`∅` fringe=none root=SYM

- ==============================================================================  
  largest `∅` pieces ``
- ==============================================================================  
  largest `∅` pieces ``
- ______________________  
  largest `∅` pieces ``

### 7× — largest=`PROPN` fill=0.25 pieces=`N+NP+PROPN+PUNCT` fringe=LR root=NOUN

- (Laughter.)  
  largest `PROPN[1-1]` pieces `PROPN[1-1], N[1-1], NP[1-1], PUNCT[2-2]` left«(» right«. )»
- (Laughter.)  
  largest `PROPN[1-1]` pieces `PROPN[1-1], N[1-1], NP[1-1], PUNCT[2-2]` left«(» right«. )»
- (Applause.)  
  largest `PROPN[1-1]` pieces `PROPN[1-1], N[1-1], NP[1-1], PUNCT[2-2]` left«(» right«. )»

### 7× — largest=`S` fill=0.71 pieces=`S` fringe=R root=VERB

- you should get a cockerspaniel.  
  largest `S[0-4]` pieces `S[0-4], S[3-6]` right«spaniel .»
- We have changed our e-mail address.  
  largest `S[0-4]` pieces `S[0-4], S[3-6]` right«address .»
- I was sold a phone by a friend and sent it off to get it recycled what can i do?  
  largest `S[0-14]` pieces `S[0-14], S[5-15], S[17-20]` right«recycled what can i do ?»

### 7× — largest=`PROPN` fill=0.5 pieces=`NP+PROPN` fringe=L root=NOUN

- - UnleadedStocks.pdf  
  largest `PROPN[1-1]` pieces `PROPN[1-1], NP[1-1]` left«-»
- - CrudeStocks.pdf  
  largest `PROPN[1-1]` pieces `PROPN[1-1], NP[1-1]` left«-»
- - HeatingOilStocks.pdf  
  largest `PROPN[1-1]` pieces `PROPN[1-1], NP[1-1]` left«-»

### 7× — largest=`S` fill=0.8 pieces=`S` fringe=R root=VERB

- they have their own website which you can easily find using any search engine.  
  largest `S[0-11]` pieces `S[0-11], S[5-14]` right«search engine .»
- you can view at dresscod.com  
  largest `S[0-3]` pieces `S[0-3]` right«dresscod.com»
- They should have one for the All Blacks winning.  
  largest `S[0-7]` pieces `S[0-7], S[2-9]` right«winning .»

### 6× — largest=`PROPN` fill=0.33 pieces=`ADV+N+NP+PROPN` fringe=L root=NUM

- 02/13/2001 08:02 PM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], NP[2-2]` left«02/13/2001 08:02»
- 08/16/2000 12:05 PM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], NP[2-2]` left«08/16/2000 12:05»
- 08/16/2000 03:48 PM  
  largest `PROPN[2-2]` pieces `PROPN[2-2], N[2-2], ADV[2-2], NP[2-2]` left«08/16/2000 03:48»

### 6× — largest=`PROPN` fill=0.5 pieces=`N+NP+PROPN` fringe=R root=PROPN

- Kay Mann  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], N[1-1], NP[1-1]` right«Mann»
- Sean Boyle  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], N[1-1], NP[1-1]` right«Boyle»
- Jolene Harvey  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PROPN[1-1], N[1-1], NP[1-1]` right«Harvey»

### 6× — largest=`S` fill=0.86 pieces=`S` fringe=R root=VERB

- The following have made a team for the game show on August 17th!.  
  largest `S[0-11]` pieces `S[0-11], S[2-12]` right«17th !.»
- One of the students indicated that he is interested in a summer internship.  
  largest `S[0-11]` pieces `S[0-11], S[5-13]` right«internship .»
- Try googling it for more info :)  
  largest `S[0-5]` pieces `S[0-5]` right«:)»

### 6× — largest=`PROPN` fill=0.5 pieces=`NP+PROPN+PUNCT` fringe=R root=PROPN

- Vladi.  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PUNCT[1-1]` right«.»
- Jill:  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PUNCT[1-1]` right«:»
- Jeff!  
  largest `PROPN[0-0]` pieces `PROPN[0-0], NP[0-0], PUNCT[1-1]` right«!»


## Interpretation (for campaign)

Do **not** treat the deprel gap table as a shopping list for local bonds.

If large clusters show NP+VP (or VP-heavy structure) already built with only fringe material (punct, fronted PP, coordinator) outside, the fix is a **closure law**, not more atoms.

Punctuation: high span recall with large root gaps often means punct is a **projection / absorption** problem, not a skeleton bond.

## Repro

```bash
node scripts/root-closure-autopsy.mjs dev
```
