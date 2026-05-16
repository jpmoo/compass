package com.compass

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream

class ScrollStitchModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ScrollStitch"

  @ReactMethod
  fun stitchVertically(paths: ReadableArray, outPath: String, promise: Promise) {
    try {
      val n = paths.size()
      if (n == 0) {
        promise.reject("EEMPTY", "no input paths")
        return
      }

      val sizes = IntArray(n * 2)
      var maxWidth = 0
      var totalHeight = 0
      for (i in 0 until n) {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(paths.getString(i), opts)
        if (opts.outWidth <= 0 || opts.outHeight <= 0) {
          promise.reject("EDECODE", "could not read size of ${paths.getString(i)}")
          return
        }
        sizes[i * 2] = opts.outWidth
        sizes[i * 2 + 1] = opts.outHeight
        if (opts.outWidth > maxWidth) maxWidth = opts.outWidth
        totalHeight += opts.outHeight
      }

      val dest = Bitmap.createBitmap(maxWidth, totalHeight, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(dest)
      canvas.drawColor(Color.WHITE)

      var y = 0
      for (i in 0 until n) {
        val page = BitmapFactory.decodeFile(paths.getString(i))
            ?: throw RuntimeException("decode failed: ${paths.getString(i)}")
        val x = (maxWidth - page.width) / 2f
        canvas.drawBitmap(page, x, y.toFloat(), null)
        y += sizes[i * 2 + 1]
        page.recycle()
      }

      File(outPath).parentFile?.mkdirs()
      FileOutputStream(outPath).use { out ->
        dest.compress(Bitmap.CompressFormat.PNG, 100, out)
      }
      dest.recycle()

      promise.resolve(outPath)
    } catch (t: Throwable) {
      promise.reject("ESTITCH", t.message ?: "stitch failed", t)
    }
  }

  /**
   * Composites pages into a 2D grid. Each `tiles` entry is
   * `{ path: string, col: int, row: int }`. `colWidths[c]` is the width
   * (px) reserved for column c; `rowHeights[r]` is the height reserved
   * for row r. Pages are drawn centered within their cell. Empty cells
   * stay white.
   */
  @ReactMethod
  fun stitchGrid(
      tiles: ReadableArray,
      colWidths: ReadableArray,
      rowHeights: ReadableArray,
      outPath: String,
      promise: Promise
  ) {
    try {
      val cols = colWidths.size()
      val rows = rowHeights.size()
      if (cols == 0 || rows == 0) {
        promise.reject("EEMPTY", "grid must have at least one row and column")
        return
      }

      // Column x-offsets and row y-offsets, plus totals.
      val colX = IntArray(cols)
      var totalW = 0
      for (c in 0 until cols) {
        colX[c] = totalW
        totalW += colWidths.getInt(c)
      }
      val rowY = IntArray(rows)
      var totalH = 0
      for (r in 0 until rows) {
        rowY[r] = totalH
        totalH += rowHeights.getInt(r)
      }

      val dest = Bitmap.createBitmap(totalW, totalH, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(dest)
      canvas.drawColor(Color.WHITE)

      val whitePaint = Paint().apply {
        color = Color.WHITE
        style = Paint.Style.FILL
      }

      for (i in 0 until tiles.size()) {
        val tile = tiles.getMap(i) ?: continue
        val path = tile.getString("path") ?: continue
        val col = tile.getInt("col")
        val row = tile.getInt("row")
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue

        val page = BitmapFactory.decodeFile(path)
            ?: throw RuntimeException("decode failed: $path")
        val cellW = colWidths.getInt(col)
        val cellH = rowHeights.getInt(row)
        val x = colX[col] + (cellW - page.width) / 2f
        val y = rowY[row] + (cellH - page.height) / 2f
        canvas.drawBitmap(page, x, y, null)
        page.recycle()

        // Optional `strip` array on the tile: rectangles in page-pixel
        // coords (relative to the tile's top-left) that should be
        // painted white. Used to scrub compass link boxes off the map.
        val strip = tile.getArray("strip")
        if (strip != null) {
          for (j in 0 until strip.size()) {
            val r = strip.getMap(j) ?: continue
            val left = x + r.getInt("left").toFloat()
            val top = y + r.getInt("top").toFloat()
            val right = x + r.getInt("right").toFloat()
            val bottom = y + r.getInt("bottom").toFloat()
            canvas.drawRect(left, top, right, bottom, whitePaint)
          }
        }
      }

      File(outPath).parentFile?.mkdirs()
      FileOutputStream(outPath).use { out ->
        dest.compress(Bitmap.CompressFormat.PNG, 100, out)
      }
      dest.recycle()

      promise.resolve(outPath)
    } catch (t: Throwable) {
      promise.reject("ESTITCH", t.message ?: "grid stitch failed", t)
    }
  }
}
