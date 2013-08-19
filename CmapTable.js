/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// XXX this doesn't work yet

function CmapTable() {
  return this;
}

function cmapFormat4CharsToGlyph(string, dataView) {
  if (string.length > 1) {
    return -1;
  }

  var charCode = string.charCodeAt(0);
  var segCount = dataView.getUint16(6) >> 1;
  var offset = 14;
  for (var i = 0; i < segCount; ++i) {
    if (dataView.getUint16(offset) >= charCode &&
        dataView.getUint16(14 + segCount*2 + 2 + i*2) <= charCode) {
      return -1; // TODO fix
    }
    offset += 2;
  }
}

function cmapFormat6CharsToGlyph(string, dataView) {
  if (string.length > 1) {
    return -1;
  }

  return -1; // TODO fix
}

CmapTable.prototype.charsToGlyph = function (string) {
  var encodings = this.dataView.getUint16(2);
  if (4 + encodings*8 > this.dataView.byteLength) {
    throw "cmap table too short";
  }

  var offset = 4;
  for (var i = 0; i < encodings; ++i) {
    var subtableOffset = this.dataView.getUint32(4 + i*8 + 4);
    if (subtableOffset + 4 > this.dataView.byteLength) {
      throw "cmap table too short";
    }
    var format = this.dataView.getUint16(subtableOffset);
    switch (format) {
    case 4:
      var length = this.dataView.getUint16(subtableOffset + 2);
      if (subtableOffset + length > this.dataView.byteLength) {
        throw "cmap table too short";
      }
      var glyphId = cmapFormat4CharsToGlyph(string,
        new DataView(this.dataView.buffer, this.dataView.byteOffset + subtableOffset, length));
      if (glyphId >= 0) {
        return glyphId;
      }
      break;
    case 6:
      var length = this.dataView.getUint16(subtableOffset + 2);
      if (subtableOffset + length > this.dataView.byteLength) {
        throw "cmap table too short";
      }
      var glyphId = cmapFormat6CharsToGlyph(string,
        new DataView(this.dataView.buffer, this.dataView.byteOffset + subtableOffset, length));
      if (glyphId >= 0) {
        return glyphId;
      }
      break;
    default: throw "cmap format " + format + " not supported";
    }
    offset += 8;
  }

  return -1;
};

CmapTable.fromTable = function (dataView) {
  if (dataView.byteLength < 4) {
    throw "cmap table too short";
  }
  if (dataView.getUint16(0) != 0) {
    throw "Unknown cmap table version";
  }

  var table = new CmapTable();
  table.dataView = dataView;
  return table;
};

