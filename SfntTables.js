/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function SfntTables(arrayBuffer) {
  this.tables = [];

  var view = new DataView(arrayBuffer);
  if (view.byteLength < 12) {
    throw "Invalid file length";
  }
  this.version = view.getUint32(0);

  var numTables = view.getUint16(4);
  if (view.byteLength < 12 + numTables*16) {
    throw "Invalid file length";
  }
  var offset = 12;
  for (var i = 0; i < numTables; ++i) {
    var tableOffset = view.getUint32(offset + 8);
    var tableLength = view.getUint32(offset + 12);
    if (tableOffset + tableLength > arrayBuffer.byteLength) {
      throw "Invalid table end: " + (tableOffset + tableLength);
    }
    this.tables.push({
      tag:view.getUint32(offset),
      view:new DataView(arrayBuffer, tableOffset, tableLength)
    });
    offset += 16;
  }
  return this;
}

SfntTables.createFromBlob = function (blob, onsuccess, onerror) {
  var reader = new FileReader();
  reader.readAsArrayBuffer(blob);
  reader.onerror = function() {
    onerror("Read failed: " + reader.error.toString());
  };
  reader.onload = function() {
    var tables;
    try {
      tables = new SfntTables(reader.result);
    } catch (ex) {
      onerror("Invalid font: " + ex);
      return;
    }
    onsuccess(tables);
  };
};

function stringToSfntTag(str) {
  if (str.length != 4) {
    throw "Tag name must be 4 characters";
  }
  var result = 0;
  for (var i = 0; i < 4; ++i) {
    var ch = str.charCodeAt(i);
    if (ch < 32 || ch > 126) {
      throw "Invalid character in tag";
    }
    result += ch << (24 - i*8);
  }
  return result;
}

SfntTables.prototype.getTable = function (tag) {
  var sfntTag = stringToSfntTag(tag);
  for (var i = 0; i < this.tables.length; ++i) {
    if (this.tables[i].tag == sfntTag) {
      return this.tables[i].view;
    }
  }
  return null;
};

SfntTables.prototype.hasTable = function (tag) {
  return this.getTable(tag) != null;
};

SfntTables.prototype.setTable = function (tag, dataView) {
  var sfntTag = stringToSfntTag(tag);
  for (var i = 0; i < this.tables.length; ++i) {
    if (this.tables[i].tag == sfntTag) {
      this.tables[i].view = dataView;
      return;
    }
  }
  this.tables.push({
    tag:sfntTag,
    view:dataView
  });
};

function checksumCombine(a, b) {
  return (a + b)&0xFFFFFFFF;
}

function calculateChecksum(view) {
  var result = 0;
  for (var offset = 0; offset < view.byteLength; offset += 4) {
    result = checksumCombine(result, view.getUint32(offset));
  }
  return result;
}

SfntTables.prototype.toBlob = function () {
  var numTables = this.tables.length;
  if (numTables > 0x0FFF) {
    throw "Too many tables";
  }

  this.tables.sort(function (a, b) {
    return a.tag - b.tag;
  });

  var header = new ArrayBuffer(12 + numTables*16);
  var headerView = new DataView(header);
  headerView.setUint32(0, this.version);
  headerView.setUint16(4, numTables);
  for (var entrySelector = 1; ; ++entrySelector) {
    if ((1 << (entrySelector + 1)) > numTables) {
      break;
    }
  }
  var searchRange = 16 << entrySelector;
  headerView.setUint16(6, searchRange);
  headerView.setUint16(8, entrySelector);
  headerView.setUint16(10, numTables*16 - searchRange);

  var parts = [];
  parts.push(header);
  var offset = 12;
  var tableOffset = header.byteLength;
  var headSfntTag = stringToSfntTag('head');
  var headTableView;
  var fileChecksum = 0;
  for (var i = 0; i < numTables; ++i) {
    var tag = this.tables[i].tag;
    headerView.setUint32(offset, tag);
    var tableView = this.tables[i].view;
    var paddedTableView = tableView;
    if (tableView.byteLength & 3) {
      var buf = new ArrayBuffer((tableView.byteLength + 3) & ~3);
      (new Uint8Array(buf, 0, tableView.byteLength)).set(
        new Uint8Array(tableView.buffer, tableView.byteOffset, tableView.byteLength));
      paddedTableView = new DataView(buf);
    }
    if (tag == headSfntTag) {
      headTableView = paddedTableView;
      // Temporarily clear checkSumAdjustment while computing table checksum
      headTableView.setUint32(8, 0);
    }
    var checksum = calculateChecksum(paddedTableView);
    headerView.setUint32(offset + 4, checksum);
    headerView.setUint32(offset + 8, tableOffset);
    headerView.setUint32(offset + 12, tableView.byteLength);
    offset += 16;
    parts.push(paddedTableView);
    fileChecksum = checksumCombine(fileChecksum, checksum);
    tableOffset += paddedTableView.byteLength;
    if (tableOffset > 0xFFFFFFFF) {
      throw "File size overflow";
    }
  }
  fileChecksum = checksumCombine(fileChecksum, calculateChecksum(headerView));

  if (headTableView) {
    headTableView.setUint32(8, (0xB1B0AFBA - fileChecksum)&0xFFFFFFFF);
  }

  return new Blob(parts);
};

