#!/usr/bin/env python3
"""
Graph Expansion Script — Plan 029 Phase 0

Expands the math knowledge graph from ~705 to ~800 topics by:
1. Splitting compound topics into atomic components
2. Adding missing topics identified via MathAcademy K-8 comparison
3. Adding prerequisite and encompassing edges for all new topics

Run: python3 tools/expand-graph.py
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

CONTENT_DIR = Path("../learn-content/math")
GRAPH_FILE = CONTENT_DIR / "graph.json"

def load_graph():
    with open(GRAPH_FILE) as f:
        return json.load(f)

def save_graph(g):
    with open(GRAPH_FILE, "w") as f:
        json.dump(g, f, indent=2)
        f.write("\n")

# ─── COMPOUND TOPIC SPLITS ───────────────────────────────────────────────
# Each split: (old_id, [new_topic_defs], edge_rewiring_rules)
# Split means: replace old topic with two or more new topics,
# rewire all prerequisite edges accordingly.

SPLITS = [
    {
        "old": "add-subtract-rationals",
        "new_topics": [
            {
                "id": "add-rationals",
                "name": "Add Rational Numbers",
                "description": "Add positive and negative fractions, decimals, and integers using rules for signed number addition.",
                "gradeLevel": 7,
                "standardCode": "7.NS.1",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "subtract-rationals",
                "name": "Subtract Rational Numbers",
                "description": "Subtract rational numbers by adding the additive inverse. Apply to fractions, decimals, and integers.",
                "gradeLevel": 7,
                "standardCode": "7.NS.1",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        # Old prereqs go to both new topics; old dependents require both
        "prereqs_to": "both",  # prereqs of old → prereqs of both new
        "dependents_from": "both",  # dependents of old now depend on both new
        "internal_edge": {"from": "add-rationals", "to": "subtract-rationals"},  # subtract requires add
    },
    {
        "old": "multiply-divide-rationals",
        "new_topics": [
            {
                "id": "multiply-rationals",
                "name": "Multiply Rational Numbers",
                "description": "Multiply positive and negative rational numbers. Apply sign rules and fraction multiplication.",
                "gradeLevel": 7,
                "standardCode": "7.NS.2",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "divide-rationals",
                "name": "Divide Rational Numbers",
                "description": "Divide rational numbers by multiplying by the reciprocal. Apply sign rules.",
                "gradeLevel": 7,
                "standardCode": "7.NS.2",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "both",
        "dependents_from": "both",
        "internal_edge": {"from": "multiply-rationals", "to": "divide-rationals"},
    },
    {
        "old": "compare-order-integers",
        "new_topics": [
            {
                "id": "compare-integers",
                "name": "Compare Integers",
                "description": "Compare integers using inequality symbols. Understand that numbers further right on the number line are greater.",
                "gradeLevel": 6,
                "standardCode": "6.NS.7",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "order-integers",
                "name": "Order Integers",
                "description": "Arrange integers in ascending or descending order. Place integers on a number line.",
                "gradeLevel": 6,
                "standardCode": "6.NS.7",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "both",
        "dependents_from": "both",
        "internal_edge": {"from": "compare-integers", "to": "order-integers"},
    },
    {
        "old": "compare-order-rationals",
        "new_topics": [
            {
                "id": "compare-rationals",
                "name": "Compare Rational Numbers",
                "description": "Compare rational numbers (fractions, decimals, integers) using inequality symbols and common denominators.",
                "gradeLevel": 6,
                "standardCode": "6.NS.7",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "order-rationals-6",
                "name": "Order Rational Numbers",
                "description": "Arrange rational numbers in ascending or descending order. Place rational numbers on a number line.",
                "gradeLevel": 6,
                "standardCode": "6.NS.7",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "both",
        "dependents_from": "both",
        "internal_edge": {"from": "compare-rationals", "to": "order-rationals-6"},
    },
    {
        "old": "add-subtract-polynomials",
        "new_topics": [
            {
                "id": "add-polynomials",
                "name": "Add Polynomials",
                "description": "Add polynomials by combining like terms. Align terms by degree.",
                "gradeLevel": 8,
                "standardCode": "A.APR.1",
                "strand": "polynomials-intro",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "subtract-polynomials",
                "name": "Subtract Polynomials",
                "description": "Subtract polynomials by distributing the negative sign and combining like terms.",
                "gradeLevel": 8,
                "standardCode": "A.APR.1",
                "strand": "polynomials-intro",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "both",
        "dependents_from": "both",
        "internal_edge": {"from": "add-polynomials", "to": "subtract-polynomials"},
    },
    {
        "old": "add-subtract-radicals",
        "new_topics": [
            {
                "id": "add-radicals",
                "name": "Add Radicals",
                "description": "Add radical expressions with like radicands. Simplify before adding when possible.",
                "gradeLevel": 8,
                "standardCode": "8.EE.2",
                "strand": "exponents-radicals",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "subtract-radicals",
                "name": "Subtract Radicals",
                "description": "Subtract radical expressions with like radicands. Simplify before subtracting.",
                "gradeLevel": 8,
                "standardCode": "8.EE.2",
                "strand": "exponents-radicals",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "both",
        "dependents_from": "both",
        "internal_edge": {"from": "add-radicals", "to": "subtract-radicals"},
    },
    # dot-plots-histograms: NOT splitting — already has separate dot-plots and histograms
    # topics as dependents/encompassed children. It serves as consolidation parent.
    {
        "old": "gcf-lcm-applications",
        "new_topics": [
            {
                "id": "gcf-applications",
                "name": "GCF Applications",
                "description": "Apply greatest common factor to solve word problems involving equal grouping and distribution.",
                "gradeLevel": 6,
                "standardCode": "6.NS.4",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
            {
                "id": "lcm-applications",
                "name": "LCM Applications",
                "description": "Apply least common multiple to solve word problems involving scheduling and repeating events.",
                "gradeLevel": 6,
                "standardCode": "6.NS.4",
                "strand": "rational-numbers",
                "contentDepth": "contextual",
                "defaultPresentation": "standard",
            },
        ],
        "prereqs_to": "first_second",  # GCF prereq goes to gcf-app, LCM to lcm-app
        "dependents_from": "both",
        "internal_edge": None,
    },
]

# ─── NEW TOPICS ──────────────────────────────────────────────────────────
# Missing topics identified via MathAcademy comparison, organized by strand.

NEW_TOPICS = [
    # ── Statistics & Probability (missing key data analysis topics) ──
    {"id": "box-plots", "name": "Box Plots", "description": "Create and interpret box-and-whisker plots. Identify median, quartiles, and range.", "gradeLevel": 6, "standardCode": "6.SP.4", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "frequency-tables", "name": "Frequency Tables", "description": "Organize data into frequency tables. Calculate relative and cumulative frequencies.", "gradeLevel": 6, "standardCode": "6.SP.5", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "mean-absolute-deviation", "name": "Mean Absolute Deviation", "description": "Calculate MAD as a measure of variability. Interpret MAD in context.", "gradeLevel": 6, "standardCode": "6.SP.5", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "quartiles-iqr", "name": "Quartiles and Interquartile Range", "description": "Find quartiles (Q1, Q2, Q3) and compute interquartile range. Use IQR to describe spread.", "gradeLevel": 6, "standardCode": "6.SP.5", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "compare-data-center", "name": "Compare Data Sets Using Center", "description": "Compare two data sets using measures of center (mean, median). Make inferences.", "gradeLevel": 7, "standardCode": "7.SP.4", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "compare-data-spread", "name": "Compare Data Sets Using Spread", "description": "Compare two data sets using measures of spread (range, IQR, MAD). Describe variability.", "gradeLevel": 7, "standardCode": "7.SP.4", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "symmetry-skew-data", "name": "Symmetry, Skew, and Outliers in Data", "description": "Describe data distributions as symmetric, left-skewed, or right-skewed. Identify outliers using IQR.", "gradeLevel": 7, "standardCode": "7.SP.4", "strand": "statistics-probability", "contentDepth": "analytical", "defaultPresentation": "standard"},
    {"id": "dot-plot-measures", "name": "Measuring Center and Spread from Dot Plots", "description": "Calculate mean, median, range, and MAD directly from dot plot representations.", "gradeLevel": 6, "standardCode": "6.SP.5", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "variance-std-dev", "name": "Variance and Standard Deviation", "description": "Calculate variance and standard deviation. Interpret as measures of data spread.", "gradeLevel": 8, "standardCode": "8.SP.1", "strand": "statistics-probability", "contentDepth": "analytical", "defaultPresentation": "standard"},

    # ── Geometry Fundamentals (missing core concepts from MA) ──
    {"id": "angle-bisectors", "name": "Angle Bisectors", "description": "Construct and identify angle bisectors. Use bisectors to find angle measures.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "segment-bisectors", "name": "Segment Bisectors and Perpendicular Bisectors", "description": "Identify segment bisectors and perpendicular bisectors. Apply the perpendicular bisector theorem.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "congruent-segments", "name": "Congruent Segments", "description": "Identify congruent segments. Use tick marks and measurement to determine congruence.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "congruent-angles", "name": "Congruent Angles", "description": "Identify congruent angles. Use arc marks and measurement to determine congruence.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "midpoints", "name": "Midpoints", "description": "Find the midpoint of a line segment. Apply the midpoint concept to solve problems.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "midpoints-coordinate", "name": "Midpoints in the Coordinate Plane", "description": "Find midpoints using the midpoint formula: ((x1+x2)/2, (y1+y2)/2).", "gradeLevel": 8, "standardCode": "8.G.8", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "heights-of-triangles", "name": "Heights of Triangles", "description": "Identify and draw heights (altitudes) of triangles. Understand that a triangle has three heights.", "gradeLevel": 7, "standardCode": "7.G.6", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "triangle-inequality-theorem", "name": "Triangle Inequality Theorem", "description": "Apply the triangle inequality: the sum of any two sides must exceed the third. Determine if three lengths form a triangle.", "gradeLevel": 7, "standardCode": "7.G.2", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "regular-polygons", "name": "Regular Polygons", "description": "Identify regular polygons. Calculate interior angle measures of regular polygons.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "exterior-angles-polygons", "name": "Exterior Angles of Polygons", "description": "Calculate exterior angle measures. Apply the exterior angle sum theorem (360°).", "gradeLevel": 8, "standardCode": "8.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "exterior-angles-triangles", "name": "Exterior Angles of Triangles", "description": "Find exterior angles of triangles. Apply the exterior angle theorem.", "gradeLevel": 8, "standardCode": "8.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "isosceles-triangle-theorem", "name": "Isosceles Triangle Theorem", "description": "Apply the isosceles triangle theorem: base angles of an isosceles triangle are congruent.", "gradeLevel": 8, "standardCode": "8.G.5", "strand": "geometry-advanced", "contentDepth": "analytical", "defaultPresentation": "standard"},
    {"id": "collinear-points", "name": "Collinear Points", "description": "Determine if points are collinear. Use slopes or the distance formula to verify collinearity.", "gradeLevel": 8, "standardCode": "8.G.8", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "segment-addition-postulate", "name": "Segment Addition Postulate", "description": "Apply the segment addition postulate: if B is between A and C, then AB + BC = AC.", "gradeLevel": 7, "standardCode": "7.G.5", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "nets-polyhedrons", "name": "Nets of Polyhedrons", "description": "Identify and draw nets of prisms, pyramids, and other polyhedrons.", "gradeLevel": 8, "standardCode": "8.G.9", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "faces-vertices-edges", "name": "Faces, Vertices, and Edges of Polyhedrons", "description": "Count faces, vertices, and edges of 3D shapes. Apply Euler's formula: V - E + F = 2.", "gradeLevel": 8, "standardCode": "8.G.9", "strand": "geometry-advanced", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Division (missing granularity from MA) ──
    {"id": "interpreting-remainders", "name": "Interpreting Remainders in Context", "description": "Interpret division remainders in word problem contexts: round up, round down, or remainder is the answer.", "gradeLevel": 4, "standardCode": "4.OA.3", "strand": "operations-division", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "division-area-model", "name": "Division Using Area Models", "description": "Divide multi-digit numbers using area (box) models. Connect to partial quotients.", "gradeLevel": 4, "standardCode": "4.NBT.6", "strand": "operations-division", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "division-partial-quotients", "name": "Division Using Partial Quotients", "description": "Divide using the partial quotients method. Build toward standard long division.", "gradeLevel": 4, "standardCode": "4.NBT.6", "strand": "operations-division", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "divide-by-two-digit", "name": "Divide by Two-Digit Divisors", "description": "Divide multi-digit numbers by two-digit divisors using the standard algorithm.", "gradeLevel": 5, "standardCode": "5.NBT.6", "strand": "operations-division", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "divide-larger-numbers", "name": "Divide Larger Numbers (4-5 Digits)", "description": "Divide four- and five-digit numbers by one-digit divisors. Apply the standard algorithm.", "gradeLevel": 5, "standardCode": "5.NBT.6", "strand": "operations-division", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "fractions-as-division", "name": "Interpret Fractions as Division", "description": "Understand that a/b means a ÷ b. Represent division results as fractions.", "gradeLevel": 5, "standardCode": "5.NF.3", "strand": "fractions", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Multiplication (missing from MA comparison) ──
    {"id": "multiply-place-value", "name": "Multiply Using Place Value Strategies", "description": "Multiply multi-digit numbers using place value decomposition. Break numbers into tens and ones.", "gradeLevel": 4, "standardCode": "4.NBT.5", "strand": "operations-multiplication", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "multiply-ending-zeros", "name": "Multiply Whole Numbers Ending in Zeros", "description": "Multiply numbers that end in zeros using patterns. Example: 30 × 40 = 1,200.", "gradeLevel": 4, "standardCode": "4.NBT.5", "strand": "operations-multiplication", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "multiply-repeated-addition", "name": "Multiply Using Repeated Addition", "description": "Connect multiplication to repeated addition. Model with groups and arrays.", "gradeLevel": 3, "standardCode": "3.OA.1", "strand": "operations-multiplication", "contentDepth": "survey", "defaultPresentation": "primary"},

    # ── Number System (missing from MA) ──
    {"id": "additive-inverses", "name": "Additive Inverses", "description": "Understand that a number and its opposite sum to zero. Apply to rational numbers.", "gradeLevel": 6, "standardCode": "6.NS.5", "strand": "rational-numbers", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "natural-integers-rationals", "name": "Natural Numbers, Integers, and Rational Numbers", "description": "Classify numbers as natural, whole, integer, or rational. Understand number set relationships.", "gradeLevel": 6, "standardCode": "6.NS.6", "strand": "rational-numbers", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "reciprocals-intro", "name": "Reciprocals", "description": "Find the reciprocal of a fraction, whole number, or mixed number. Understand that a × (1/a) = 1.", "gradeLevel": 6, "standardCode": "6.NS.1", "strand": "rational-numbers", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "divisibility-rules-2-5-10", "name": "Divisibility Rules (2, 5, 10)", "description": "Apply divisibility rules for 2, 5, and 10 using last digit patterns.", "gradeLevel": 4, "standardCode": "4.OA.5", "strand": "number-base", "contentDepth": "survey", "defaultPresentation": "intermediate"},
    {"id": "divisibility-rules-3-6-9", "name": "Divisibility Rules (3, 6, 9)", "description": "Apply divisibility rules for 3, 6, and 9 using digit sum patterns.", "gradeLevel": 4, "standardCode": "4.OA.5", "strand": "number-base", "contentDepth": "contextual", "defaultPresentation": "intermediate"},

    # ── Equations & Inequalities (missing granularity) ──
    {"id": "equations-unknown-coefficients", "name": "Solve Equations with Unknown Coefficients", "description": "Solve for a variable when coefficients contain another unknown. Literal equations.", "gradeLevel": 8, "standardCode": "A.CED.4", "strand": "expressions-equations", "contentDepth": "analytical", "defaultPresentation": "standard"},
    {"id": "equations-clearing-fractions", "name": "Solve Equations by Clearing Fractions", "description": "Multiply both sides by the LCD to eliminate fractions from equations.", "gradeLevel": 7, "standardCode": "7.EE.4", "strand": "expressions-equations", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "interval-notation", "name": "Interval Notation", "description": "Write solution sets using interval notation: open/closed brackets, infinity symbols.", "gradeLevel": 8, "standardCode": "A.REI.3", "strand": "expressions-equations", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "equations-trial-error", "name": "Solve Equations by Trial and Error", "description": "Find solutions to simple equations by substituting values and checking.", "gradeLevel": 6, "standardCode": "6.EE.5", "strand": "expressions-equations", "contentDepth": "survey", "defaultPresentation": "standard"},

    # ── Linear Functions (missing from MA) ──
    {"id": "modeling-linear-equations", "name": "Modeling with Linear Equations", "description": "Write linear equations to model real-world situations. Interpret slope and intercept in context.", "gradeLevel": 8, "standardCode": "8.F.4", "strand": "linear-functions", "contentDepth": "analytical", "defaultPresentation": "standard"},
    {"id": "consistency-dependency-systems", "name": "Consistent, Inconsistent, and Dependent Systems", "description": "Classify systems of equations as consistent (one solution), inconsistent (no solution), or dependent (infinite solutions).", "gradeLevel": 8, "standardCode": "8.EE.8", "strand": "linear-functions", "contentDepth": "analytical", "defaultPresentation": "standard"},
    {"id": "two-variable-equations-solutions", "name": "Two-Variable Equations and Their Solutions", "description": "Determine if ordered pairs are solutions to two-variable equations. Generate solution pairs.", "gradeLevel": 8, "standardCode": "8.EE.7", "strand": "linear-functions", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Ratios & Percentages (missing from MA) ──
    {"id": "equivalent-ratios-advanced", "name": "Further Reasoning with Equivalent Ratios", "description": "Solve complex ratio problems using tables, graphs, and double number lines.", "gradeLevel": 6, "standardCode": "6.RP.3", "strand": "ratios-proportions", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "graphing-ratios", "name": "Graphing Ratios", "description": "Plot equivalent ratios on coordinate planes. Interpret ratio graphs.", "gradeLevel": 6, "standardCode": "6.RP.3", "strand": "ratios-proportions", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "find-original-from-percent-increase", "name": "Find Original Value from Percent Increase", "description": "Given a final value after a percent increase, find the original value.", "gradeLevel": 7, "standardCode": "7.RP.3", "strand": "ratios-proportions", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "find-original-from-percent-decrease", "name": "Find Original Value from Percent Decrease", "description": "Given a final value after a percent decrease, find the original value.", "gradeLevel": 7, "standardCode": "7.RP.3", "strand": "ratios-proportions", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "successive-percents", "name": "Applying Percentages in Succession", "description": "Apply multiple percentage changes sequentially. Understand compound percentage effects.", "gradeLevel": 7, "standardCode": "7.RP.3", "strand": "ratios-proportions", "contentDepth": "analytical", "defaultPresentation": "standard"},

    # ── Exponents (missing from MA comparison) ──
    {"id": "compare-exponents", "name": "Compare Exponents", "description": "Compare expressions with exponents. Determine which expression has a greater value.", "gradeLevel": 5, "standardCode": "5.NBT.2", "strand": "exponents-radicals", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "larger-exponents", "name": "Evaluate Larger Exponents", "description": "Evaluate expressions with exponents beyond squares and cubes. Powers of 2, 3, etc.", "gradeLevel": 5, "standardCode": "5.NBT.2", "strand": "exponents-radicals", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "exponents-whole-expressions", "name": "Evaluate Expressions Containing Exponents", "description": "Evaluate multi-operation expressions that include exponents. Apply order of operations.", "gradeLevel": 5, "standardCode": "5.NBT.2", "strand": "exponents-radicals", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Measurement & Data (missing from MA) ──
    {"id": "units-of-length", "name": "Units of Length", "description": "Understand and compare standard units of length (inch, foot, yard, mile; mm, cm, m, km).", "gradeLevel": 3, "standardCode": "3.MD.4", "strand": "measurement-data", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "units-of-mass", "name": "Units of Mass", "description": "Understand and compare standard units of mass (ounce, pound, ton; gram, kilogram).", "gradeLevel": 3, "standardCode": "3.MD.2", "strand": "measurement-data", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "units-of-volume-capacity", "name": "Units of Volume and Capacity", "description": "Understand and compare standard units of volume (cup, pint, quart, gallon; mL, L).", "gradeLevel": 3, "standardCode": "3.MD.2", "strand": "measurement-data", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "units-of-time", "name": "Units of Time", "description": "Understand and convert between units of time (seconds, minutes, hours, days, weeks).", "gradeLevel": 3, "standardCode": "3.MD.1", "strand": "measurement-data", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "convert-customary-length", "name": "Convert Customary Units of Length", "description": "Convert between inches, feet, yards, and miles.", "gradeLevel": 4, "standardCode": "4.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "convert-metric-length", "name": "Convert Metric Units of Length", "description": "Convert between millimeters, centimeters, meters, and kilometers.", "gradeLevel": 4, "standardCode": "4.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "convert-units-mass", "name": "Convert Units of Mass", "description": "Convert between ounces, pounds, tons; grams, kilograms.", "gradeLevel": 4, "standardCode": "4.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "convert-units-volume", "name": "Convert Units of Volume", "description": "Convert between cups, pints, quarts, gallons; milliliters, liters.", "gradeLevel": 4, "standardCode": "4.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "convert-units-time", "name": "Convert Units of Time", "description": "Convert between seconds, minutes, hours, days, weeks, months, years.", "gradeLevel": 4, "standardCode": "4.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "convert-units-area", "name": "Convert Units of Area", "description": "Convert between square units (sq in to sq ft, sq cm to sq m). Understand area unit relationships.", "gradeLevel": 5, "standardCode": "5.MD.1", "strand": "measurement-data", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Counting & Cardinality (fill gaps in K strand) ──
    {"id": "count-forward-from", "name": "Count Forward from Any Number", "description": "Count forward from a given number within 100. Start at any number, not just 1.", "gradeLevel": 0, "standardCode": "K.CC.2", "strand": "counting-cardinality", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "count-by-twos", "name": "Count by Twos", "description": "Skip count by 2s starting from 0. Recognize even number patterns.", "gradeLevel": 1, "standardCode": "1.NBT.1", "strand": "counting-cardinality", "contentDepth": "survey", "defaultPresentation": "primary"},
    {"id": "count-by-fives", "name": "Count by Fives", "description": "Skip count by 5s starting from 0. Connect to telling time and money.", "gradeLevel": 1, "standardCode": "1.NBT.1", "strand": "counting-cardinality", "contentDepth": "survey", "defaultPresentation": "primary"},

    # ── Algebra Thinking (missing from MA) ──
    {"id": "represent-comparisons-equations", "name": "Represent Comparisons as Equations", "description": "Write additive and multiplicative comparison statements as equations.", "gradeLevel": 4, "standardCode": "4.OA.1", "strand": "algebra-thinking", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "multi-step-word-problems-4ops", "name": "Multi-Step Word Problems Using Four Operations", "description": "Solve multi-step word problems using addition, subtraction, multiplication, and division.", "gradeLevel": 4, "standardCode": "4.OA.3", "strand": "algebra-thinking", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "generating-patterns", "name": "Generating Number Patterns", "description": "Generate patterns from a rule. Identify relationships between corresponding terms.", "gradeLevel": 4, "standardCode": "4.OA.5", "strand": "algebra-thinking", "contentDepth": "contextual", "defaultPresentation": "intermediate"},
    {"id": "graphing-patterns", "name": "Graphing Patterns", "description": "Plot pattern data on coordinate planes. Identify if patterns are linear or nonlinear.", "gradeLevel": 5, "standardCode": "5.OA.3", "strand": "algebra-thinking", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Polynomials (fill gaps) ──
    {"id": "polynomial-expressions", "name": "Polynomial Expressions", "description": "Identify and write polynomial expressions. Determine degree and leading coefficient.", "gradeLevel": 8, "standardCode": "A.APR.1", "strand": "polynomials-intro", "contentDepth": "contextual", "defaultPresentation": "standard"},

    # ── Probability (genuinely missing) ──
    {"id": "sample-spaces-events", "name": "Sample Spaces and Events", "description": "List all possible outcomes in a sample space. Define events as subsets of sample spaces.", "gradeLevel": 7, "standardCode": "7.SP.7", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "experimental-probability-data", "name": "Probability from Experimental Data", "description": "Calculate experimental probability from data. Compare to theoretical probability.", "gradeLevel": 7, "standardCode": "7.SP.6", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "complement-events", "name": "Complement of an Event", "description": "Find the probability of an event not occurring: P(A') = 1 - P(A).", "gradeLevel": 7, "standardCode": "7.SP.7", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
    {"id": "venn-diagrams-probability", "name": "Venn Diagrams in Probability", "description": "Use Venn diagrams to represent and calculate probabilities of compound events.", "gradeLevel": 7, "standardCode": "7.SP.8", "strand": "statistics-probability", "contentDepth": "contextual", "defaultPresentation": "standard"},
]

# ─── NEW PREREQUISITE EDGES ──────────────────────────────────────────────
# Edges for new topics only (split edges are handled by the split logic)

NEW_PREREQS = [
    # Statistics
    {"from": "mean", "to": "mean-absolute-deviation", "strength": 1, "type": "required"},
    {"from": "mean", "to": "dot-plot-measures", "strength": 1, "type": "required"},
    {"from": "dot-plots", "to": "dot-plot-measures", "strength": 1, "type": "required"},
    {"from": "mean-absolute-deviation", "to": "compare-data-spread", "strength": 1, "type": "required"},
    {"from": "quartiles-iqr", "to": "compare-data-spread", "strength": 1, "type": "required"},
    {"from": "quartiles-iqr", "to": "box-plots", "strength": 1, "type": "required"},
    {"from": "median", "to": "quartiles-iqr", "strength": 1, "type": "required"},
    {"from": "range", "to": "quartiles-iqr", "strength": 1, "type": "required"},
    {"from": "mean", "to": "compare-data-center", "strength": 1, "type": "required"},
    {"from": "median", "to": "compare-data-center", "strength": 1, "type": "required"},
    {"from": "compare-data-center", "to": "symmetry-skew-data", "strength": 1, "type": "required"},
    {"from": "compare-data-spread", "to": "symmetry-skew-data", "strength": 1, "type": "required"},
    {"from": "collect-organize-data", "to": "frequency-tables", "strength": 1, "type": "required"},
    {"from": "frequency-tables", "to": "histograms", "strength": 1, "type": "required"},
    {"from": "mean-absolute-deviation", "to": "variance-std-dev", "strength": 1, "type": "required"},
    {"from": "quartiles-iqr", "to": "symmetry-skew-data", "strength": 1, "type": "required"},

    # Probability
    {"from": "probability-intro", "to": "sample-spaces-events", "strength": 1, "type": "required"},
    {"from": "sample-spaces-events", "to": "complement-events", "strength": 1, "type": "required"},
    {"from": "probability-intro", "to": "experimental-probability-data", "strength": 1, "type": "required"},
    {"from": "complement-events", "to": "venn-diagrams-probability", "strength": 1, "type": "required"},
    {"from": "compound-probability", "to": "venn-diagrams-probability", "strength": 1, "type": "required"},

    # Geometry
    {"from": "angles-measure", "to": "angle-bisectors", "strength": 1, "type": "required"},
    {"from": "points-lines-rays", "to": "segment-bisectors", "strength": 1, "type": "required"},
    {"from": "points-lines-rays", "to": "congruent-segments", "strength": 1, "type": "required"},
    {"from": "angles-measure", "to": "congruent-angles", "strength": 1, "type": "required"},
    {"from": "congruent-segments", "to": "midpoints", "strength": 1, "type": "required"},
    {"from": "segment-bisectors", "to": "midpoints", "strength": 1, "type": "required"},
    {"from": "midpoints", "to": "midpoints-coordinate", "strength": 1, "type": "required"},
    {"from": "coordinate-plane-four-quadrants", "to": "midpoints-coordinate", "strength": 1, "type": "required"},
    {"from": "area-triangles", "to": "heights-of-triangles", "strength": 1, "type": "required"},
    {"from": "classify-triangles", "to": "triangle-inequality-theorem", "strength": 1, "type": "required"},
    {"from": "interior-angles-polygons", "to": "regular-polygons", "strength": 1, "type": "required"},
    {"from": "interior-angles-polygons", "to": "exterior-angles-polygons", "strength": 1, "type": "required"},
    {"from": "interior-angles-polygons", "to": "exterior-angles-triangles", "strength": 1, "type": "required"},
    {"from": "classify-triangles", "to": "isosceles-triangle-theorem", "strength": 1, "type": "required"},
    {"from": "congruent-angles", "to": "isosceles-triangle-theorem", "strength": 1, "type": "required"},
    {"from": "points-lines-rays", "to": "collinear-points", "strength": 1, "type": "required"},
    {"from": "points-lines-rays", "to": "segment-addition-postulate", "strength": 1, "type": "required"},
    {"from": "surface-area-prisms", "to": "nets-polyhedrons", "strength": 1, "type": "required"},
    {"from": "volume-prisms", "to": "faces-vertices-edges", "strength": 1, "type": "required"},

    # Division
    {"from": "division-remainders-intro", "to": "interpreting-remainders", "strength": 1, "type": "required"},
    {"from": "long-division", "to": "division-area-model", "strength": 1, "type": "required"},
    {"from": "long-division", "to": "division-partial-quotients", "strength": 1, "type": "required"},
    {"from": "long-division", "to": "divide-by-two-digit", "strength": 1, "type": "required"},
    {"from": "long-division", "to": "divide-larger-numbers", "strength": 1, "type": "required"},
    {"from": "divide-fractions", "to": "fractions-as-division", "strength": 1, "type": "required"},

    # Multiplication
    {"from": "multiply-within-100", "to": "multiply-place-value", "strength": 1, "type": "required"},
    {"from": "multiply-by-10-100-1000", "to": "multiply-ending-zeros", "strength": 1, "type": "required"},
    {"from": "equal-groups", "to": "multiply-repeated-addition", "strength": 1, "type": "required"},

    # Number system
    {"from": "integers-intro", "to": "additive-inverses", "strength": 1, "type": "required"},
    {"from": "integers-intro", "to": "natural-integers-rationals", "strength": 1, "type": "required"},
    {"from": "divide-fractions", "to": "reciprocals-intro", "strength": 1, "type": "required"},
    {"from": "factors-multiples", "to": "divisibility-rules-2-5-10", "strength": 1, "type": "required"},
    {"from": "divisibility-rules-2-5-10", "to": "divisibility-rules-3-6-9", "strength": 1, "type": "required"},

    # Equations
    {"from": "multi-step-equations", "to": "equations-unknown-coefficients", "strength": 1, "type": "required"},
    {"from": "equations-fractional-coefficients", "to": "equations-clearing-fractions", "strength": 1, "type": "required"},
    {"from": "compound-inequalities", "to": "interval-notation", "strength": 1, "type": "required"},
    {"from": "one-step-equations-add-sub", "to": "equations-trial-error", "strength": 1, "type": "recommended"},

    # Linear functions
    {"from": "slope-intercept-form", "to": "modeling-linear-equations", "strength": 1, "type": "required"},
    {"from": "systems-no-one-infinite", "to": "consistency-dependency-systems", "strength": 1, "type": "required"},
    {"from": "graph-linear-equations", "to": "two-variable-equations-solutions", "strength": 1, "type": "required"},

    # Ratios
    {"from": "equivalent-ratios", "to": "equivalent-ratios-advanced", "strength": 1, "type": "required"},
    {"from": "ratios-intro", "to": "graphing-ratios", "strength": 1, "type": "required"},
    {"from": "percent-increase-decrease", "to": "find-original-from-percent-increase", "strength": 1, "type": "required"},
    {"from": "percent-increase-decrease", "to": "find-original-from-percent-decrease", "strength": 1, "type": "required"},
    {"from": "find-original-from-percent-increase", "to": "successive-percents", "strength": 1, "type": "required"},

    # Exponents
    {"from": "evaluating-exponents", "to": "compare-exponents", "strength": 1, "type": "required"},
    {"from": "evaluating-exponents", "to": "larger-exponents", "strength": 1, "type": "required"},
    {"from": "evaluating-exponents", "to": "exponents-whole-expressions", "strength": 1, "type": "required"},
    {"from": "order-of-operations", "to": "exponents-whole-expressions", "strength": 1, "type": "required"},

    # Measurement
    {"from": "measure-length-standard", "to": "units-of-length", "strength": 1, "type": "required"},
    {"from": "weight-mass-intro", "to": "units-of-mass", "strength": 1, "type": "required"},
    {"from": "capacity-intro", "to": "units-of-volume-capacity", "strength": 1, "type": "required"},
    {"from": "tell-time-hour-half", "to": "units-of-time", "strength": 1, "type": "required"},
    {"from": "units-of-length", "to": "convert-customary-length", "strength": 1, "type": "required"},
    {"from": "units-of-length", "to": "convert-metric-length", "strength": 1, "type": "required"},
    {"from": "units-of-mass", "to": "convert-units-mass", "strength": 1, "type": "required"},
    {"from": "units-of-volume-capacity", "to": "convert-units-volume", "strength": 1, "type": "required"},
    {"from": "units-of-time", "to": "convert-units-time", "strength": 1, "type": "required"},
    {"from": "unit-conversion", "to": "convert-units-area", "strength": 1, "type": "required"},

    # Counting
    {"from": "count-to-20", "to": "count-forward-from", "strength": 1, "type": "required"},
    {"from": "count-to-20", "to": "count-by-twos", "strength": 1, "type": "required"},
    {"from": "count-to-20", "to": "count-by-fives", "strength": 1, "type": "required"},

    # Algebra thinking
    {"from": "multiply-word-problems-comparison", "to": "represent-comparisons-equations", "strength": 1, "type": "required"},
    {"from": "add-word-problems-multi-step", "to": "multi-step-word-problems-4ops", "strength": 1, "type": "required"},
    {"from": "growing-patterns", "to": "generating-patterns", "strength": 1, "type": "required"},
    {"from": "generating-patterns", "to": "graphing-patterns", "strength": 1, "type": "required"},
    {"from": "coordinate-plane", "to": "graphing-patterns", "strength": 1, "type": "required"},

    # Polynomials
    {"from": "polynomials-classify", "to": "polynomial-expressions", "strength": 1, "type": "required"},
]

# ─── NEW ENCOMPASSING EDGES ─────────────────────────────────────────────

NEW_ENCOMPASSINGS = [
    # Split topic encompassings
    {"parent": "add-rationals", "child": "integer-addition", "weight": 0.5},
    {"parent": "subtract-rationals", "child": "integer-subtraction", "weight": 0.5},
    {"parent": "multiply-rationals", "child": "integer-multiplication", "weight": 0.5},
    {"parent": "divide-rationals", "child": "integer-division", "weight": 0.5},
    {"parent": "compare-rationals", "child": "compare-integers", "weight": 0.6},
    {"parent": "order-rationals-6", "child": "order-integers", "weight": 0.6},

    # Statistics
    {"parent": "box-plots", "child": "quartiles-iqr", "weight": 0.7},
    {"parent": "compare-data-center", "child": "mean", "weight": 0.4},
    {"parent": "compare-data-center", "child": "median", "weight": 0.4},

    # Geometry
    {"parent": "midpoints-coordinate", "child": "midpoints", "weight": 0.6},
    {"parent": "exterior-angles-polygons", "child": "exterior-angles-triangles", "weight": 0.7},

    # Division
    {"parent": "divide-by-two-digit", "child": "long-division", "weight": 0.5},
    {"parent": "divide-larger-numbers", "child": "long-division", "weight": 0.5},

    # Measurement conversions encompass unit knowledge
    {"parent": "convert-customary-length", "child": "units-of-length", "weight": 0.4},
    {"parent": "convert-metric-length", "child": "units-of-length", "weight": 0.4},
    {"parent": "convert-units-mass", "child": "units-of-mass", "weight": 0.4},
    {"parent": "convert-units-volume", "child": "units-of-volume-capacity", "weight": 0.4},
    {"parent": "convert-units-time", "child": "units-of-time", "weight": 0.4},
]


def apply_splits(g):
    """Split compound topics into atomic components."""
    topics_by_id = {t["id"]: t for t in g["topics"]}
    new_topics = []
    removed_ids = set()

    for split in SPLITS:
        old_id = split["old"]
        if old_id not in topics_by_id:
            print(f"  WARNING: Split target '{old_id}' not found, skipping")
            continue

        old_topic = topics_by_id[old_id]
        removed_ids.add(old_id)

        # Add new topics
        for nt in split["new_topics"]:
            new_topics.append(nt)
            print(f"  SPLIT: {old_id} → {nt['id']}")

        # Rewire prerequisites
        new_topic_ids = [nt["id"] for nt in split["new_topics"]]

        # Find edges TO old topic (old topic's prereqs)
        old_prereqs = [p for p in g["prerequisites"] if p["to"] == old_id]
        # Find edges FROM old topic (old topic's dependents)
        old_dependents = [p for p in g["prerequisites"] if p["from"] == old_id]

        # Remove old edges
        g["prerequisites"] = [
            p for p in g["prerequisites"]
            if p["to"] != old_id and p["from"] != old_id
        ]

        # Add new edges based on rewiring rules
        if split["prereqs_to"] == "both":
            for p in old_prereqs:
                for new_id in new_topic_ids:
                    g["prerequisites"].append({
                        "from": p["from"], "to": new_id,
                        "strength": p["strength"], "type": p["type"]
                    })
        elif split["prereqs_to"] == "first_second":
            # First prereq goes to first new topic, second to second
            for i, p in enumerate(old_prereqs):
                target = new_topic_ids[min(i, len(new_topic_ids) - 1)]
                g["prerequisites"].append({
                    "from": p["from"], "to": target,
                    "strength": p["strength"], "type": p["type"]
                })

        # Dependents now require both (or all) new topics
        if split["dependents_from"] == "both":
            for d in old_dependents:
                for new_id in new_topic_ids:
                    g["prerequisites"].append({
                        "from": new_id, "to": d["to"],
                        "strength": d["strength"], "type": d["type"]
                    })

        # Internal edge between split parts
        if split.get("internal_edge"):
            ie = split["internal_edge"]
            g["prerequisites"].append({
                "from": ie["from"], "to": ie["to"],
                "strength": 1, "type": "required"
            })

        # Rewire encompassing edges
        old_encomp_parent = [e for e in g["encompassings"] if e["parent"] == old_id]
        old_encomp_child = [e for e in g["encompassings"] if e["child"] == old_id]

        g["encompassings"] = [
            e for e in g["encompassings"]
            if e["parent"] != old_id and e["child"] != old_id
        ]

        # Parent encompassings go to first new topic
        for e in old_encomp_parent:
            g["encompassings"].append({
                "parent": new_topic_ids[0], "child": e["child"], "weight": e["weight"]
            })
        # Child encompassings go to both
        for e in old_encomp_child:
            for new_id in new_topic_ids:
                g["encompassings"].append({
                    "parent": e["parent"], "child": new_id, "weight": e["weight"]
                })

    # Remove old topics, add new ones
    g["topics"] = [t for t in g["topics"] if t["id"] not in removed_ids] + new_topics

    # Clean up stale edges referencing removed topics
    valid_ids = {t["id"] for t in g["topics"]}
    before_prereqs = len(g["prerequisites"])
    g["prerequisites"] = [
        p for p in g["prerequisites"]
        if p["from"] in valid_ids and p["to"] in valid_ids
    ]
    before_encomp = len(g["encompassings"])
    g["encompassings"] = [
        e for e in g["encompassings"]
        if e["parent"] in valid_ids and e["child"] in valid_ids
    ]
    stale_prereqs = before_prereqs - len(g["prerequisites"])
    stale_encomp = before_encomp - len(g["encompassings"])
    if stale_prereqs or stale_encomp:
        print(f"  Cleaned up {stale_prereqs} stale prereq edges, {stale_encomp} stale encompassing edges")

    return g


def add_new_topics(g):
    """Add missing topics from MA comparison."""
    existing_ids = {t["id"] for t in g["topics"]}
    added = 0
    for nt in NEW_TOPICS:
        if nt["id"] in existing_ids:
            print(f"  SKIP (exists): {nt['id']}")
            continue
        g["topics"].append(nt)
        added += 1
        print(f"  ADD: {nt['id']}: {nt['name']}")
    print(f"  Added {added} new topics")
    return g


def add_new_edges(g):
    """Add prerequisite and encompassing edges for new topics."""
    existing_ids = {t["id"] for t in g["topics"]}
    existing_prereqs = {(p["from"], p["to"]) for p in g["prerequisites"]}
    existing_encomp = {(e["parent"], e["child"]) for e in g["encompassings"]}

    prereq_added = 0
    for p in NEW_PREREQS:
        if p["from"] not in existing_ids:
            print(f"  WARN: prereq from '{p['from']}' not found")
            continue
        if p["to"] not in existing_ids:
            print(f"  WARN: prereq to '{p['to']}' not found")
            continue
        if (p["from"], p["to"]) not in existing_prereqs:
            g["prerequisites"].append(p)
            existing_prereqs.add((p["from"], p["to"]))
            prereq_added += 1

    encomp_added = 0
    for e in NEW_ENCOMPASSINGS:
        if e["parent"] not in existing_ids:
            print(f"  WARN: encompassing parent '{e['parent']}' not found")
            continue
        if e["child"] not in existing_ids:
            print(f"  WARN: encompassing child '{e['child']}' not found")
            continue
        if (e["parent"], e["child"]) not in existing_encomp:
            g["encompassings"].append(e)
            existing_encomp.add((e["parent"], e["child"]))
            encomp_added += 1

    print(f"  Added {prereq_added} prerequisite edges, {encomp_added} encompassing edges")
    return g


def validate_dag(g):
    """Check for cycles in the prerequisite graph."""
    adj = defaultdict(list)
    for p in g["prerequisites"]:
        adj[p["from"]].append(p["to"])

    visited = set()
    in_stack = set()
    cycle_found = []

    def dfs(node, path):
        if node in in_stack:
            cycle_start = path.index(node)
            cycle_found.append(path[cycle_start:] + [node])
            return True
        if node in visited:
            return False
        visited.add(node)
        in_stack.add(node)
        path.append(node)
        for neighbor in adj[node]:
            if dfs(neighbor, path):
                return True
        path.pop()
        in_stack.remove(node)
        return False

    topic_ids = {t["id"] for t in g["topics"]}
    for tid in topic_ids:
        if tid not in visited:
            if dfs(tid, []):
                break

    return cycle_found


def print_stats(g):
    """Print graph statistics."""
    topics = g["topics"]
    prereqs = g["prerequisites"]
    encomp = g["encompassings"]

    strands = defaultdict(int)
    for t in topics:
        strands[t.get("strand", "?")] += 1

    print(f"\n  Total topics: {len(topics)}")
    print(f"  Prerequisite edges: {len(prereqs)}")
    print(f"  Encompassing edges: {len(encomp)}")
    print(f"  Prereq density: {len(prereqs)/len(topics):.2f}/topic")
    print(f"  Encompassing density: {len(encomp)/len(topics):.2f}/topic")
    print(f"\n  Topics by strand:")
    for s, c in sorted(strands.items(), key=lambda x: -x[1]):
        print(f"    {s}: {c}")


def main():
    print("Loading graph...")
    g = load_graph()
    print(f"  Loaded {len(g['topics'])} topics")

    print("\nStep 1: Splitting compound topics...")
    g = apply_splits(g)

    print("\nStep 2: Adding new topics...")
    g = add_new_topics(g)

    print("\nStep 3: Adding new edges...")
    g = add_new_edges(g)

    print("\nStep 4: Validating DAG...")
    cycles = validate_dag(g)
    if cycles:
        print(f"  ERROR: {len(cycles)} cycle(s) found!")
        for c in cycles[:5]:
            print(f"    Cycle: {' → '.join(c)}")
        sys.exit(1)
    else:
        print("  No cycles found ✓")

    print("\nStep 5: Checking for duplicate edges...")
    prereq_dupes = len(g["prerequisites"]) - len({(p["from"], p["to"]) for p in g["prerequisites"]})
    if prereq_dupes:
        # Deduplicate
        seen = set()
        deduped = []
        for p in g["prerequisites"]:
            key = (p["from"], p["to"])
            if key not in seen:
                seen.add(key)
                deduped.append(p)
        g["prerequisites"] = deduped
        print(f"  Removed {prereq_dupes} duplicate prerequisite edges")

    encomp_dupes = len(g["encompassings"]) - len({(e["parent"], e["child"]) for e in g["encompassings"]})
    if encomp_dupes:
        seen = set()
        deduped = []
        for e in g["encompassings"]:
            key = (e["parent"], e["child"])
            if key not in seen:
                seen.add(key)
                deduped.append(e)
        g["encompassings"] = deduped
        print(f"  Removed {encomp_dupes} duplicate encompassing edges")

    print("\nFinal statistics:")
    print_stats(g)

    print("\nSaving graph...")
    save_graph(g)
    print("  Done ✓")


if __name__ == "__main__":
    main()