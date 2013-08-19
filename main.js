/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// An SfntTables object representing the current font data, or null/undefined if
// nothing is loaded yet.
var currentTables;
// A Blob URL referencing the Blob form of the current font data, or null/undefined
// if nothing is loaded yet.
var blobURL;

// Update the current font to include an "SVG " table with the contents of the
// svgText element, reporting errors if necessary.
function updateFont() {
  svgTextError.classList.remove("error");
  inlineStyle.textContent = "";
  download.removeAttribute("href");

  if (blobURL) {
    URL.revokeObjectURL(blobURL);
    blobURL = null;
  }

  if (!currentTables) {
    return;
  }

  var svgTable;
  try {
    svgTable = SvgTable.fromDocuments([svgText.value]);
  } catch (ex) {
    svgTextError.classList.add("error");
    svgTextError.textContent = "Invalid SVG: " + ex;
  }

  if (svgTable) {
    currentTables.setTable("SVG ", new DataView(svgTable.toArrayBuffer()));
  }
  blobURL = URL.createObjectURL(currentTables.toBlob());
  inlineStyle.textContent =
    "@font-face { font-family:SampleFont; src:url('" + blobURL + "'); }";
  download.href = blobURL;
}

// Set up the current font by reading the contents of the currently selected file 
function readFile() {
  currentTables = null;
  svgText.value = "";

  var files = inputFile.files;
  if (files.length == 0) {
    updateFont();
    return;
  }

  SfntTables.createFromBlob(files[0], function (tables) {
    currentTables = tables;
    if (currentTables.hasTable("SVG ")) {
      var svgTable;
      try {
        svgTable = SvgTable.fromTable(tables.getTable("SVG "));
      } catch (ex) {
        alert("Malformed SVG table: " + ex);
      }
      if (svgTable) {
        svgText.value = svgTable.getDocumentText(0);
      }
    }
    updateFont();
  }, function (error) {
    alert("Cannot parse font: " + error);
  });
}

// Fill in svgText with a useful initial template
function createTemplate() {
  svgText.value +=
    "<svg xmlns='http://www.w3.org/2000/svg'>\n" +
    "<rect id='glyph37' x='0' y='-500' width='500' height='500' fill='lime'/>\n" +
    "</svg>\n";
  updateFont();
}

function init() {
  inputFile.addEventListener("change", readFile);
  svgText.addEventListener("input", updateFont);
  createTemplateButton.addEventListener("click", createTemplate);

  var sampleText = [];
  for (var i = 32; i <= 127; ++i) {
    sampleText.push(String.fromCharCode(i));
    if (i%32 == 31) {
      sampleText.push('\n');
    }
  }
  sample.textContent = sampleText.join('');

  readFile();
}

window.addEventListener("DOMContentLoaded", init);
