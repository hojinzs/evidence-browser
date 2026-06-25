# Markdown Rich Test

## 요약

이 문서는 모든 GFM(GitHub Flavored Markdown) 요소를 포함합니다.

[요약으로](#요약)

### 세 번째 수준 헤더

#### 네 번째 수준 헤더

##### 다섯 번째 수준 헤더

###### 여섯 번째 수준 헤더

일반 단락 텍스트입니다. 여러 문장을 포함합니다. **굵은 텍스트**와 *기울임꼴 텍스트*도 사용합니다.

## 목록

### 순서 없는 목록

- 항목 1
- 항목 2
  - 중첩 항목 2-1
  - 중첩 항목 2-2
- 항목 3

### 순서 있는 목록

1. 첫 번째
2. 두 번째
   1. 중첩 2-1
   2. 중첩 2-2
3. 세 번째

## 인용문

> 이것은 인용문 블록입니다.
>
> 여러 단락을 포함할 수 있습니다.
>
> > 중첩 인용문도 지원됩니다.

## 코드

### 인라인 코드

`console.log("hello")` 와 같은 인라인 코드입니다.

### 펜스드 코드 블록

```typescript
interface Evidence {
  id: string;
  title: string;
  files: FileEntry[];
  createdAt: Date;
}

function processEvidence(evidence: Evidence): void {
  console.log(`Processing: ${evidence.title}`);
  for (const file of evidence.files) {
    console.log(`  - ${file.path}`);
  }
}
```

```python
def analyze_results(data: dict) -> bool:
    """Analyze test results and return pass/fail."""
    total = data.get("total", 0)
    passed = data.get("passed", 0)
    return passed / total >= 0.95 if total > 0 else False
```

```bash
#!/bin/bash
echo "Running evidence collection..."
tar czf evidence.tar.gz --exclude=node_modules .
```

## 테이블

| 컬럼 A | 컬럼 B | 컬럼 C |
|--------|--------|--------|
| 값 1   | 값 2   | 값 3   |
| 값 4   | 값 5   | 값 6   |
| 값 7   | 값 8   | 값 9   |

### 정렬된 테이블

| 왼쪽 정렬 | 가운데 정렬 | 오른쪽 정렬 |
|:-----------|:-----------:|------------:|
| Left       |   Center    |       Right |
| AAA        |    BBB      |         CCC |

## 링크

### 내부 링크

- [서브 문서](docs/sub-doc.md)
- [다이어그램 이미지](images/diagram.png)
- [TypeScript 예제](code/example.ts)

### 외부 링크

- [GitHub](https://github.com)
- [MDN Web Docs](https://developer.mozilla.org)

### 앵커 링크

- [요약으로](#요약)
- [코드 섹션으로](#코드)

## 이미지

![다이어그램](images/diagram.png)

![사진](images/photo.jpg)

![아이콘](images/icon.svg)

![애니메이션](images/animated.gif)

---

## 작업 목록

- [x] 마크다운 파서 구현
- [x] GFM 확장 지원
- [ ] 수학 수식 지원
- [ ] Mermaid 다이어그램 지원

## 취소선

~~이 텍스트는 취소되었습니다.~~

---

*문서 끝*
