package com.scrollexport_scaffold

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
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
}
