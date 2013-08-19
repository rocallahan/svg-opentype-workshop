/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function SvgTable() {
  this.documents = [];
  return this;
}

SvgTable.prototype.getDocumentCount = function() {
  return this.documents.length;
};

SvgTable.prototype.getDocumentText = function (index) {
  if (index >= this.documents.length) {
    throw "Invalid document index";
  }
  return this.documents[index].text;
};

SvgTable.prototype.toArrayBuffer = function () {
  var numDocuments = this.documents.length;
  if (numDocuments > 0xFFFF) {
    throw "Too many documents";
  }
  var docOffset = 12 + 12*numDocuments;
  var encodedTexts = [];
  var encoder = new TextEncoder();
  var docOffsets = [];
  for (var i = 0; i < numDocuments; ++i) {
    for (var j = 0; j < i; ++j) {
      if (this.documents[j].text == this.documents[i].text) {
        break;
      }
    }
    if (j < i) {
      // Reuse existing document text
      docOffsets.push(docOffsets[j]);
      encodedTexts.push(null);
    } else {
      docOffsets.push(docOffset);
      encodedTexts.push(encoder.encode(this.documents[i].text));
      docOffset += encodedTexts[i].byteLength;
    }
  }
  if (length > 0xFFFFFFFF) {
    throw "Table size overflow";
  }
  var buf = new ArrayBuffer(docOffset);
  var headerView = new DataView(buf);
  var docIndexOffset = 10;
  headerView.setUint16(0, 0);
  headerView.setUint32(2, docIndexOffset);
  headerView.setUint32(6, 0);
  headerView.setUint16(docIndexOffset, numDocuments);
  var offset = docIndexOffset + 2;
  for (var i = 0; i < numDocuments; ++i) {
    headerView.setUint16(offset, this.documents[i].startGlyphId);
    headerView.setUint16(offset + 2, this.documents[i].endGlyphId);
    headerView.setUint32(offset + 4, docOffsets[i]);
    var textLength = encodedTexts[i].byteLength;
    headerView.setUint32(offset + 8, textLength);
    if (encodedTexts[i]) {
      (new Uint8Array(buf, docOffsets[i], textLength)).set(encodedTexts[i]);
    }
    offset += 12;
  }
  return buf;
};

SvgTable.fromDocuments = function (documents) {
  if (documents.length == 0) {
    throw "Must have at least one document";
  }

  var glyphMapping = [];
  var parser = new DOMParser();
  for (var i = 0; i < documents.length; ++i) {
    var doc = parser.parseFromString(documents[i], "image/svg+xml");
    var parseErrs = doc.getElementsByTagName("parsererror");
    if (parseErrs.length > 0) {
      throw "Parse error: " + parseErrs[0].textContent;
    }

    var elementsWithGlyphIds = doc.querySelectorAll("[id]");
    var glyphIds = [];
    for (var j = 0; j < elementsWithGlyphIds.length; ++j) {
      var m = /^glyph([0-9]+)$/.exec(elementsWithGlyphIds[j].getAttribute("id"));
      if (m) {
        glyphMapping.push({id:m[1], doc:documents[i]});
      }
    }
  }

  if (glyphMapping.length == 0) {
    throw "No elements with id 'glyphNNN' found";
  }

  glyphMapping.sort(function (a, b) {
    return a.id - b.id;
  });

  var table = new SvgTable();
  var startOfRun = 0;
  for (var j = 0; j < glyphMapping.length; ++j) {
    if (j > 0 && glyphMapping[j].id == glyphMapping[j - 1].id) {
      throw "Duplicate glyphs found for glyph ID " + glyphMapping[j].id;
    }
    if (j == glyphMapping.length - 1 ||
        glyphMapping[j + 1].id != glyphMapping[j].id + 1 ||
        glyphMapping[j + 1].doc != glyphMapping[j].doc) {
      // End of a run
      table.documents.push({
        startGlyphId:glyphMapping[startOfRun].id,
        endGlyphId:glyphMapping[j].id,
        text:glyphMapping[j].doc
      });
      startOfRun = j + 1;
    }
  }

  return table;
};

SvgTable.fromTable = function (dataView) {
  if (dataView.getUint16(0) != 0) {
    throw "Unknown table version";
  }
  if (dataView.getUint32(6) != 0) {
    throw "Color palettes not supported yet";
  }
  var docIndexOffset = dataView.getUint32(2);
  if (docIndexOffset + 2 > dataView.byteLength) {
    throw "Document index out of range";
  }
  var numEntries = dataView.getUint16(docIndexOffset);
  if (docIndexOffset + 2 + numEntries*12 > dataView.byteLength) {
    throw "Document index out of range";
  }
  if (numEntries == 0) {
    throw "Must have at least one document";
  }

  var table = new SvgTable();
  var offset = docIndexOffset + 2;
  var textDecoder = new TextDecoder();
  for (var i = 0; i < numEntries; ++i) {
    var startGlyphId = dataView.getUint16(offset);
    var endGlyphId = dataView.getUint16(offset + 2);
    if (startGlyphId > endGlyphId) {
      throw "Misordered glyph ids";
    }
    if (i > 0 && table.documents[i - 1].endGlyphId >= startGlyphId) {
      throw "Misordered glyph ids with previous document";
    }
    var docOffset = dataView.getUint32(offset + 4);
    var docLength = dataView.getUint32(offset + 8);
    if (docOffset + docLength > dataView.byteLength) {
      throw "Document end out of range";
    }
    var docText = textDecoder.decode(
      new DataView(dataView.buffer, dataView.byteOffset + docOffset, docLength));
    table.documents.push({
      startGlyphId:startGlyphId,
      endGlyphId:endGlyphId,
      text:docText
    });
    offset += 12;
  }

  return table;
};

